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
from openai import OpenAI
from typing import List
import json
import asyncio
import time

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

async def process_single_pdf_ocr_only(
    client: OpenAI, 
    file_content: bytes, 
    filename: str,
    semaphore: asyncio.Semaphore
) -> dict:
    """Process single PDF OCR only (step 1)"""
    
    async with semaphore:
        start_time = time.time()
        temp_pdf_path = None
        
        try:
            # Save file content temporarily
            with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as temp_file:
                temp_file.write(file_content)
                temp_pdf_path = temp_file.name
            
            # Convert PDF pages to images
            try:
                images = convert_from_path(temp_pdf_path)
            except Exception as e:
                if temp_pdf_path:
                    os.unlink(temp_pdf_path)
                return {
                    "filename": filename,
                    "success": False,
                    "error": f"Failed to convert PDF: {str(e)}",
                    "processing_time_ms": int((time.time() - start_time) * 1000)
                }
            
            # Step 1: OCR Processing in parallel
            print(f"Starting OCR for {filename} with {len(images)} pages")
            page_semaphore = asyncio.Semaphore(20)  # Max 20 pages in parallel
            ocr_tasks = [
                process_page_async(client, image, i, page_semaphore)
                for i, image in enumerate(images)
            ]
            ocr_results = await asyncio.gather(*ocr_tasks)
            
            # Extract combined text from OCR results
            extracted_text = ""
            for result in ocr_results:
                if result.get("response") and not result.get("error"):
                    try:
                        parsed = json.loads(result["response"])
                        extracted_text += parsed.get("text", result["response"]) + "\n\n"
                    except:
                        extracted_text += str(result["response"]) + "\n\n"
            
            # Clean up temp file
            if temp_pdf_path:
                os.unlink(temp_pdf_path)
            
            processing_time = int((time.time() - start_time) * 1000)
            print(f"Completed OCR for {filename} in {processing_time}ms")
            
            return {
                "filename": filename,
                "success": True,
                "total_pages": len(images),
                "ocr_results": {
                    "total_pages": len(images),
                    "results": ocr_results
                },
                "extracted_text": extracted_text.strip(),
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
    """Process one or multiple PDF files OCR (step 1)"""
    
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
        
        print(f"Starting OCR processing of {len(files)} PDF file(s)")
        
        # Read all file contents first
        file_contents = []
        for file in files:
            content = await file.read()
            file_contents.append((content, file.filename))
        
        # Process all PDFs in parallel with max 5 concurrent files to avoid API rate limits
        semaphore = asyncio.Semaphore(5)
        tasks = [
            process_single_pdf_ocr_only(client, content, filename, semaphore)
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
        
        print(f"Completed OCR processing all {len(files)} file(s) in {total_processing_time}ms")
        
        return JSONResponse(content={
            "success": True,
            "total_files": len(files),
            "processing_time_ms": total_processing_time,
            "results": processed_results
        })
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF processing failed: {str(e)}")

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
        
        # Process all entries in parallel
        tasks = [
            extract_vote_patterns_async(client, entry.text)
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
                    "error": f"Vote pattern extraction failed: {str(result)}"
                })
            else:
                processed_results.append({
                    "filename": request.entries[i].filename,
                    "success": True,
                    "vote_patterns": result
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

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)