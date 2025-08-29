from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import os
import tempfile
import base64
from io import BytesIO
from PIL import Image
from pdf2image import convert_from_path
import PyPDF2
from openai import OpenAI
from typing import List
import json
import asyncio
import time
import math

app = FastAPI(title="Vote Tracking API")

# Configure CORS for frontend - more flexible for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000", 
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "https://*.vercel.app"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models for request bodies
class TextAnalysisRequest(BaseModel):
    text: str
    api_key: str

class MultiTextEntry(BaseModel):
    filename: str
    text: str

class MultiTextAnalysisRequest(BaseModel):
    entries: List[MultiTextEntry]
    api_key: str

class MultiTextAnalysisWithRubricRequest(BaseModel):
    entries: List[MultiTextEntry]
    rubric: str
    api_key: str

def create_text_windows(text: str, window_size: int = 20000, shift_size: int = 10000, threshold: int = 25000) -> List[str]:
    """
    Split text into overlapping windows if it exceeds the threshold.
    
    Args:
        text: Input text to split
        window_size: Size of each window in characters (default: 20000)
        shift_size: How much to shift between windows in characters (default: 10000)
        threshold: Minimum text length to trigger windowing (default: 25000)
    
    Returns:
        List of text chunks. If text <= threshold, returns [text].
        Otherwise returns overlapping windows.
    """
    text_length = len(text)
    
    # If text is small enough, return as-is
    if text_length <= threshold:
        return [text]
    
    windows = []
    start_pos = 0
    
    while start_pos < text_length:
        # Calculate end position for this window
        end_pos = min(start_pos + window_size, text_length)
        
        # Extract the window
        window = text[start_pos:end_pos]
        windows.append(window)
        
        # If this window reaches the end of text, we're done
        if end_pos >= text_length:
            break
            
        # Move to next window start position
        start_pos += shift_size
    
    return windows

def merge_vote_pattern_results(results: List[dict]) -> dict:
    """
    Merge vote pattern results from multiple text windows.
    
    Args:
        results: List of vote pattern result dictionaries, each containing a "bills" array
        
    Returns:
        Merged result dictionary with combined bills and resolved conflicts
    """
    if not results:
        return {"bills": []}
    
    # Define action priority (higher number = higher priority)
    action_priority = {
        "abstained": 1,
        "voted_against": 2,
        "voted_for": 3,
        "co_sponsored/seconder": 4,
        "sponsored/mover": 5
    }
    
    # Dictionary to store merged bills by bill_name
    merged_bills = {}
    
    for result in results:
        # Handle case where result might be a string (JSON) or already parsed dict
        if isinstance(result, str):
            try:
                result = json.loads(result)
            except:
                continue
        
        # Skip if result doesn't have bills
        if not isinstance(result, dict) or "bills" not in result:
            continue
            
        for bill in result["bills"]:
            bill_name = bill.get("bill_name", "")
            if not bill_name:
                continue
                
            # Initialize bill if not seen before
            if bill_name not in merged_bills:
                merged_bills[bill_name] = {
                    "bill_name": bill_name,
                    "council_members": {}
                }
            
            # Merge council members for this bill
            for member in bill.get("council_members", []):
                member_name = member.get("member_name", "")
                action = member.get("action", "")
                
                if not member_name or not action:
                    continue
                
                # If this member hasn't been seen for this bill, add them
                if member_name not in merged_bills[bill_name]["council_members"]:
                    merged_bills[bill_name]["council_members"][member_name] = action
                else:
                    # Resolve conflict by choosing higher priority action
                    existing_action = merged_bills[bill_name]["council_members"][member_name]
                    existing_priority = action_priority.get(existing_action, 0)
                    new_priority = action_priority.get(action, 0)
                    
                    if new_priority > existing_priority:
                        merged_bills[bill_name]["council_members"][member_name] = action
    
    # Convert merged bills back to the expected format
    final_bills = []
    for bill_name, bill_data in merged_bills.items():
        council_members = [
            {
                "member_name": member_name,
                "action": action
            }
            for member_name, action in bill_data["council_members"].items()
        ]
        
        final_bills.append({
            "bill_name": bill_name,
            "council_members": council_members
        })
    
    return {"bills": final_bills}

def extract_text_directly_from_pdf(pdf_path: str) -> tuple[str, int]:
    """
    Extract text directly from PDF using PyPDF2.
    
    Args:
        pdf_path: Path to the PDF file
        
    Returns:
        Tuple of (extracted_text, page_count)
    """
    try:
        extracted_text = ""
        page_count = 0
        
        with open(pdf_path, 'rb') as file:
            pdf_reader = PyPDF2.PdfReader(file)
            page_count = len(pdf_reader.pages)
            
            for page_num, page in enumerate(pdf_reader.pages):
                try:
                    page_text = page.extract_text()
                    if page_text:
                        extracted_text += f"\n\n--- Page {page_num + 1} ---\n"
                        extracted_text += page_text
                except Exception as e:
                    print(f"Failed to extract text from page {page_num + 1}: {str(e)}")
                    # Continue to next page if one page fails
                    continue
        
        return extracted_text.strip(), page_count
        
    except Exception as e:
        print(f"Failed to extract text from PDF {pdf_path}: {str(e)}")
        return "", 0

def image_to_base64(image: Image.Image) -> str:
    """Convert PIL Image to base64 string"""
    buffered = BytesIO()
    image.save(buffered, format="PNG")
    img_str = base64.b64encode(buffered.getvalue()).decode()
    return f"data:image/png;base64,{img_str}"

async def process_page_async(client: OpenAI, image: Image.Image, page_num: int, semaphore: asyncio.Semaphore) -> dict:
    """Process a single page asynchronously with semaphore for concurrency control"""
    async with semaphore:
        try:
            # Convert image to base64
            image_base64 = image_to_base64(image)
            
            print(f"Making LLM request for page {page_num + 1}")
            
            # Call OpenAI API in a thread pool to avoid blocking
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                lambda: client.responses.create(
                    model="gpt-4.1",
                    input=[
                        {
                            "role": "system",
                            "content": [
                                {
                                    "type": "input_text",
                                    "text": "Output all of the text you see in the image"
                                }
                            ]
                        },
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "input_image",
                                    "image_url": image_base64,
                                },
                            ],
                        }
                    ],
                    text={
                        "format": {
                            "type": "json_schema",
                            "name": "page_to_text",
                            "strict": True,
                            "schema": {
                                "type": "object",
                                "properties": {
                                    "text": {
                                        "type": "string",
                                        "description": "Write down all of the text you see in the image.",
                                        "minLength": 1
                                    }
                                },
                                "required": [
                                    "text"
                                ],
                                "additionalProperties": False
                            }
                        }
                    },
                    reasoning={},
                    tools=[],
                    temperature=1,
                    max_output_tokens=2048,
                    top_p=1,
                    store=True
                )
            )
            
            print(f"Completed LLM request for page {page_num + 1}")
            
            return {
                "page": page_num + 1,
                "response": response.output_text
            }
            
        except Exception as e:
            print(f"Failed LLM request for page {page_num + 1}: {str(e)}")
            return {
                "page": page_num + 1,
                "error": f"Failed to process page {page_num + 1}: {str(e)}"
            }

async def extract_attendees_async(client: OpenAI, text: str) -> dict:
    """Extract attendees asynchronously"""
    try:
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: client.responses.create(
                model="gpt-5",
                input=[
                    {
                        "role": "system",
                        "content": [
                            {
                                "type": "input_text",
                                "text": "Based on the text provided, return the names of all of the city council members who attended the meeting"
                            }
                        ]
                    },
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "input_text",
                                "text": text
                            }
                        ]
                    }
                ],
                text={
                    "format": {
                        "type": "json_schema",
                        "name": "council_meeting_attendance",
                        "strict": True,
                        "schema": {
                            "type": "object",
                            "properties": {
                                "attending_members": {
                                    "type": "array",
                                    "description": "A list of city council members who attended the meeting, as found in the notes.",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "name": {
                                                "type": "string",
                                                "description": "Full name of the city council member."
                                            }
                                        },
                                        "required": [
                                            "name"
                                        ],
                                        "additionalProperties": False
                                    }
                                }
                            },
                            "required": [
                                "attending_members"
                            ],
                            "additionalProperties": False
                        }
                    }
                },
                reasoning={
                    "effort": "minimal"
                },
                tools=[],
                temperature=1,
                max_output_tokens=2048,
                top_p=1,
                store=True
            )
        )
        return response.output_text
    except Exception as e:
        raise e

async def extract_vote_patterns_async(client: OpenAI, text: str) -> dict:
    """Extract vote patterns asynchronously"""
    try:
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: client.responses.create(
                model="o3",
                input=[
                    {
                        "role": "developer",
                        "content": [
                            {
                                "type": "input_text",
                                "text": "Given the text and the list of city council members, output whether they sponsored, co-sponsored, voted for, or voted against the bill "
                            }
                        ]
                    },
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "input_text",
                                "text": text
                            }
                        ]
                    }
                ],
                text={
                    "format": {
                        "type": "json_schema",
                        "name": "city_council_bill_unique_action",
                        "strict": True,
                        "schema": {
                            "type": "object",
                            "properties": {
                                "bills": {
                                    "type": "array",
                                    "description": "List of bills discussed in the text.",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "bill_name": {
                                                "type": "string",
                                                "description": "Name or identifier of the bill."
                                            },
                                            "council_members": {
                                                "type": "array",
                                                "description": "List of all city council members and their mutually exclusive action on this bill.",
                                                "items": {
                                                    "type": "object",
                                                    "properties": {
                                                        "member_name": {
                                                            "type": "string",
                                                            "description": "Full name of the city council member."
                                                        },
                                                        "action": {
                                                            "type": "string",
                                                            "description": "The mutually exclusive action taken by the member on this bill.",
                                                            "enum": [
                                                                "sponsored/mover",
                                                                "co_sponsored/seconder",
                                                                "voted_for",
                                                                "voted_against",
                                                                "abstained"
                                                            ]
                                                        }
                                                    },
                                                    "required": [
                                                        "member_name",
                                                        "action"
                                                    ],
                                                    "additionalProperties": False
                                                }
                                            }
                                        },
                                        "required": [
                                            "bill_name",
                                            "council_members"
                                        ],
                                        "additionalProperties": False
                                    }
                                }
                            },
                            "required": [
                                "bills"
                            ],
                            "additionalProperties": False
                        }
                    }
                },
                reasoning={
                    "effort": "high"
                },
                tools=[],
                store=True
            )
        )
        return response.output_text
    except Exception as e:
        raise e

async def analyze_laws_async(client: OpenAI, text: str, rubric: str) -> dict:
    """Analyze laws based on rubric asynchronously"""
    try:
        # Combine rubric and text as specified in the requirements
        combined_content = f"[rubric here]\n{rubric}\n[ocr text here]\n{text}"
        
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: client.responses.create(
                model="gpt-5",
                input=[
                    {
                        "role": "developer",
                        "content": [
                            {
                                "type": "input_text",
                                "text": "Based on the following rubric and text, give a score for each law and provide an explanation for the score"
                            }
                        ]
                    },
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "input_text",
                                "text": combined_content
                            }
                        ]
                    }
                ],
                text={
                    "format": {
                        "type": "json_schema",
                        "name": "law_rubric_scoring",
                        "strict": True,
                        "schema": {
                            "type": "object",
                            "properties": {
                                "laws": {
                                    "type": "array",
                                    "description": "A list of all laws scored per the context-specific rubric.",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "law_name": {
                                                "type": "string",
                                                "description": "The short name or official title of the law."
                                            },
                                            "description": {
                                                "type": "string",
                                                "description": "A summary or plain-language description of the law."
                                            },
                                            "score": {
                                                "type": "number",
                                                "description": "The numeric score for this law according to the rubric.",
                                                "minimum": 0
                                            },
                                            "explanation": {
                                                "type": "string",
                                                "description": "Explanation (with reasoning) for why this law received its score."
                                            }
                                        },
                                        "required": [
                                            "law_name",
                                            "description",
                                            "score",
                                            "explanation"
                                        ],
                                        "additionalProperties": False
                                    }
                                }
                            },
                            "required": [
                                "laws"
                            ],
                            "additionalProperties": False
                        }
                    },
                    "verbosity": "medium"
                },
                reasoning={
                    "effort": "high"
                },
                tools=[],
                store=True,
                include=[
                    "reasoning.encrypted_content",
                    "web_search_call.action.sources"
                ]
            )
        )
        return response.output_text
    except Exception as e:
        raise e

async def process_single_pdf_text_extraction(
    client: OpenAI, 
    file_content: bytes, 
    filename: str,
    semaphore: asyncio.Semaphore
) -> dict:
    """Process single PDF with hybrid text extraction: direct extraction first, OCR fallback"""
    
    async with semaphore:
        start_time = time.time()
        temp_pdf_path = None
        
        try:
            # Save file content temporarily
            with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as temp_file:
                temp_file.write(file_content)
                temp_pdf_path = temp_file.name
            
            # Step 1: Try direct text extraction first
            print(f"Attempting direct text extraction for {filename}")
            extracted_text, page_count = extract_text_directly_from_pdf(temp_pdf_path)
            
            # Check if direct extraction was successful (threshold: 100 characters minimum)
            if extracted_text and len(extracted_text.strip()) >= 100:
                print(f"Direct text extraction successful for {filename}: {len(extracted_text)} characters from {page_count} pages")
                
                # Clean up temp file
                if temp_pdf_path:
                    os.unlink(temp_pdf_path)
                
                processing_time = int((time.time() - start_time) * 1000)
                
                return {
                    "filename": filename,
                    "success": True,
                    "total_pages": page_count,
                    "extraction_method": "direct",
                    "extracted_text": extracted_text.strip(),
                    "processing_time_ms": processing_time
                }
            
            # Step 2: Fallback to OCR if direct extraction failed or yielded minimal text
            print(f"Direct extraction insufficient for {filename} ({len(extracted_text)} chars), falling back to OCR")
            
            # Convert PDF pages to images for OCR
            try:
                images = convert_from_path(temp_pdf_path)
            except Exception as e:
                if temp_pdf_path:
                    os.unlink(temp_pdf_path)
                return {
                    "filename": filename,
                    "success": False,
                    "error": f"Failed to convert PDF for OCR: {str(e)}",
                    "processing_time_ms": int((time.time() - start_time) * 1000)
                }
            
            # OCR Processing in parallel
            print(f"Starting OCR fallback for {filename} with {len(images)} pages")
            page_semaphore = asyncio.Semaphore(20)  # Max 20 pages in parallel
            ocr_tasks = [
                process_page_async(client, image, i, page_semaphore)
                for i, image in enumerate(images)
            ]
            ocr_results = await asyncio.gather(*ocr_tasks)
            
            # Extract combined text from OCR results
            ocr_text = ""
            for result in ocr_results:
                if result.get("response") and not result.get("error"):
                    try:
                        parsed = json.loads(result["response"])
                        ocr_text += parsed.get("text", result["response"]) + "\n\n"
                    except:
                        ocr_text += str(result["response"]) + "\n\n"
            
            # Clean up temp file
            if temp_pdf_path:
                os.unlink(temp_pdf_path)
            
            processing_time = int((time.time() - start_time) * 1000)
            print(f"Completed OCR fallback for {filename} in {processing_time}ms")
            
            return {
                "filename": filename,
                "success": True,
                "total_pages": len(images),
                "extraction_method": "ocr",
                "ocr_results": {
                    "total_pages": len(images),
                    "results": ocr_results
                },
                "extracted_text": ocr_text.strip(),
                "processing_time_ms": processing_time
            }
            
        except Exception as e:
            # Clean up temp file if it exists
            if temp_pdf_path:
                try:
                    os.unlink(temp_pdf_path)
                except:
                    pass
            
            return {
                "filename": filename,
                "success": False,
                "error": f"Processing failed: {str(e)}",
                "processing_time_ms": int((time.time() - start_time) * 1000)
            }

@app.post("/process-pdfs")
async def process_pdfs(
    files: List[UploadFile] = File(...),
    api_key: str = Form(...)
):
    """Process one or multiple PDF files with hybrid text extraction (step 1)"""
    
    if not api_key:
        raise HTTPException(status_code=400, detail="OpenAI API key is required")
    
    if not files:
        raise HTTPException(status_code=400, detail="At least one PDF file is required")
    
    # Validate all files are PDFs
    for file in files:
        if not file.filename.endswith('.pdf'):
            raise HTTPException(status_code=400, detail=f"All files must be PDFs. Invalid file: {file.filename}")
    
    try:
        # Initialize OpenAI client with provided API key
        client = OpenAI(api_key=api_key)
        
        start_time = time.time()
        
        print(f"Starting text extraction of {len(files)} PDF file(s)")
        
        # Read all file contents first
        file_contents = []
        for file in files:
            content = await file.read()
            file_contents.append((content, file.filename))
        
        # Process all PDFs in parallel with higher concurrency since direct extraction doesn't hit API limits
        semaphore = asyncio.Semaphore(20)  # Increased from 5 to 20 since direct extraction is much faster
        tasks = [
            process_single_pdf_text_extraction(client, content, filename, semaphore)
            for content, filename in file_contents
        ]
        
        # Execute all tasks in parallel
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Handle any exceptions that occurred
        processed_results = []
        for result in results:
            if isinstance(result, Exception):
                processed_results.append({
                    "filename": "unknown",
                    "success": False,
                    "error": f"Processing failed: {str(result)}",
                    "processing_time_ms": 0
                })
            else:
                processed_results.append(result)
        
        total_processing_time = int((time.time() - start_time) * 1000)
        
        print(f"Completed text extraction of all {len(files)} file(s) in {total_processing_time}ms")
        
        return JSONResponse(content={
            "success": True,
            "total_files": len(files),
            "processing_time_ms": total_processing_time,
            "results": processed_results
        })
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Text extraction failed: {str(e)}")

@app.post("/extract-attendees-batch")
async def extract_attendees_batch(request: MultiTextAnalysisRequest):
    """Extract meeting attendees for one or multiple text entries"""
    
    if not request.api_key:
        raise HTTPException(status_code=400, detail="API key is required")
    
    if not request.entries:
        raise HTTPException(status_code=400, detail="At least one text entry is required")
    
    try:
        # Initialize OpenAI client with provided API key
        client = OpenAI(api_key=request.api_key)
        
        start_time = time.time()
        
        print(f"Starting attendee extraction for {len(request.entries)} text entries")
        
        # Process all entries in parallel
        tasks = [
            extract_attendees_async(client, entry.text)
            for entry in request.entries
        ]
        
        # Execute all tasks in parallel
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Handle any exceptions that occurred
        processed_results = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                processed_results.append({
                    "filename": request.entries[i].filename,
                    "success": False,
                    "error": f"Attendee extraction failed: {str(result)}"
                })
            else:
                processed_results.append({
                    "filename": request.entries[i].filename,
                    "success": True,
                    "attendees": result
                })
        
        total_processing_time = int((time.time() - start_time) * 1000)
        
        print(f"Completed attendee extraction for all {len(request.entries)} entries in {total_processing_time}ms")
        
        return JSONResponse(content={
            "success": True,
            "total_entries": len(request.entries),
            "processing_time_ms": total_processing_time,
            "results": processed_results
        })
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Attendee extraction failed: {str(e)}")

@app.post("/extract-vote-patterns-batch")
async def extract_vote_patterns_batch(request: MultiTextAnalysisRequest):
    """Extract vote patterns for one or multiple text entries"""
    
    if not request.api_key:
        raise HTTPException(status_code=400, detail="API key is required")
    
    if not request.entries:
        raise HTTPException(status_code=400, detail="At least one text entry is required")
    
    try:
        # Initialize OpenAI client with provided API key
        client = OpenAI(api_key=request.api_key)
        
        start_time = time.time()
        
        print(f"Starting vote pattern extraction for {len(request.entries)} text entries")
        
        # Process each entry (some may require windowing)
        processed_results = []
        
        for entry in request.entries:
            try:
                text_length = len(entry.text)
                print(f"Processing {entry.filename} - {text_length} characters")
                
                # Check if text requires windowed processing
                if text_length > 25000:
                    print(f"  Using windowed processing for {entry.filename}")
                    
                    # Create windows
                    windows = create_text_windows(entry.text)
                    print(f"  Created {len(windows)} windows for {entry.filename}")
                    
                    # Process each window in parallel
                    window_tasks = [
                        extract_vote_patterns_async(client, window_text)
                        for window_text in windows
                    ]
                    
                    # Execute window tasks
                    window_results = await asyncio.gather(*window_tasks, return_exceptions=True)
                    
                    # Filter out exceptions and extract successful results
                    successful_results = []
                    for j, window_result in enumerate(window_results):
                        if isinstance(window_result, Exception):
                            print(f"  Window {j+1} failed for {entry.filename}: {str(window_result)}")
                        else:
                            successful_results.append(window_result)
                    
                    if not successful_results:
                        processed_results.append({
                            "filename": entry.filename,
                            "success": False,
                            "error": "All windows failed during processing",
                            "windowed_processing": True,
                            "window_count": len(windows),
                            "original_text_length": text_length
                        })
                    else:
                        # Merge results from all windows
                        merged_result = merge_vote_pattern_results(successful_results)
                        
                        processed_results.append({
                            "filename": entry.filename,
                            "success": True,
                            "vote_patterns": merged_result,
                            "windowed_processing": True,
                            "window_count": len(windows),
                            "original_text_length": text_length,
                            "successful_windows": len(successful_results)
                        })
                        
                        print(f"  Completed windowed processing for {entry.filename}")
                
                else:
                    print(f"  Using standard processing for {entry.filename}")
                    
                    # Standard processing for smaller texts
                    result = await extract_vote_patterns_async(client, entry.text)
                    
                    processed_results.append({
                        "filename": entry.filename,
                        "success": True,
                        "vote_patterns": result,
                        "windowed_processing": False,
                        "original_text_length": text_length
                    })
                    
                    print(f"  Completed standard processing for {entry.filename}")
                    
            except Exception as e:
                processed_results.append({
                    "filename": entry.filename,
                    "success": False,
                    "error": f"Vote pattern extraction failed: {str(e)}",
                    "windowed_processing": text_length > 25000 if 'text_length' in locals() else False,
                    "original_text_length": text_length if 'text_length' in locals() else 0
                })
        
        total_processing_time = int((time.time() - start_time) * 1000)
        
        print(f"Completed vote pattern extraction for all {len(request.entries)} entries in {total_processing_time}ms")
        
        return JSONResponse(content={
            "success": True,
            "total_entries": len(request.entries),
            "processing_time_ms": total_processing_time,
            "results": processed_results
        })
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Vote pattern extraction failed: {str(e)}")

@app.post("/analyze-laws-batch")
async def analyze_laws_batch(request: MultiTextAnalysisWithRubricRequest):
    """Analyze laws based on rubric for one or multiple text entries"""
    
    if not request.api_key:
        raise HTTPException(status_code=400, detail="API key is required")
    
    if not request.entries:
        raise HTTPException(status_code=400, detail="At least one text entry is required")
    
    if not request.rubric.strip():
        raise HTTPException(status_code=400, detail="Rubric is required")
    
    try:
        # Initialize OpenAI client with provided API key
        client = OpenAI(api_key=request.api_key)
        
        start_time = time.time()
        
        print(f"Starting law analysis for {len(request.entries)} text entries")
        
        # Process all entries in parallel
        tasks = [
            analyze_laws_async(client, entry.text, request.rubric)
            for entry in request.entries
        ]
        
        # Execute all tasks in parallel
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Handle any exceptions that occurred
        processed_results = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                processed_results.append({
                    "filename": request.entries[i].filename,
                    "success": False,
                    "error": f"Law analysis failed: {str(result)}"
                })
            else:
                processed_results.append({
                    "filename": request.entries[i].filename,
                    "success": True,
                    "law_analysis": result
                })
        
        total_processing_time = int((time.time() - start_time) * 1000)
        
        print(f"Completed law analysis for all {len(request.entries)} entries in {total_processing_time}ms")
        
        return JSONResponse(content={
            "success": True,
            "total_entries": len(request.entries),
            "processing_time_ms": total_processing_time,
            "results": processed_results
        })
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Law analysis failed: {str(e)}")

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)