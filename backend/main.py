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
                model="gpt-4.1",
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
                reasoning={},
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
                                                                "sponsored",
                                                                "co_sponsored",
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
                    "effort": "medium"
                },
                tools=[],
                store=True
            )
        )
        return response.output_text
    except Exception as e:
        raise e

async def process_single_pdf_complete(
    client: OpenAI, 
    file_content: bytes, 
    filename: str,
    semaphore: asyncio.Semaphore
) -> dict:
    """Process single PDF through all 3 steps in parallel"""
    
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
            
            print(f"OCR complete for {filename}, starting parallel attendee and vote extraction")
            
            # Steps 2 & 3: Run attendees and vote patterns in parallel
            attendees_task = extract_attendees_async(client, extracted_text)
            vote_patterns_task = extract_vote_patterns_async(client, extracted_text)
            
            attendees_result, vote_result = await asyncio.gather(
                attendees_task, vote_patterns_task, return_exceptions=True
            )
            
            # Clean up temp file
            if temp_pdf_path:
                os.unlink(temp_pdf_path)
            
            processing_time = int((time.time() - start_time) * 1000)
            print(f"Completed processing {filename} in {processing_time}ms")
            
            return {
                "filename": filename,
                "success": True,
                "total_pages": len(images),
                "ocr_results": {
                    "total_pages": len(images),
                    "results": ocr_results
                },
                "extracted_text": extracted_text.strip(),
                "attendees": attendees_result if not isinstance(attendees_result, Exception) else None,
                "vote_patterns": vote_result if not isinstance(vote_result, Exception) else None,
                "processing_time_ms": processing_time,
                "attendees_error": str(attendees_result) if isinstance(attendees_result, Exception) else None,
                "vote_patterns_error": str(vote_result) if isinstance(vote_result, Exception) else None
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

@app.post("/process-pdf")
async def process_pdf(
    file: UploadFile = File(...),
    api_key: str = Form(...)
):
    """Process PDF file with OpenAI vision model"""
    
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="File must be a PDF")
    
    if not api_key:
        raise HTTPException(status_code=400, detail="OpenAI API key is required")
    
    try:
        # Initialize OpenAI client with provided API key
        client = OpenAI(api_key=api_key)
        
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as temp_file:
            content = await file.read()
            temp_file.write(content)
            temp_pdf_path = temp_file.name
        
        # Convert PDF pages to images
        try:
            images = convert_from_path(temp_pdf_path)
        except Exception as e:
            os.unlink(temp_pdf_path)
            raise HTTPException(status_code=500, detail=f"Failed to convert PDF: {str(e)}")
        
        # Process all pages in parallel with max 20 concurrent requests
        print(f"Starting parallel processing of {len(images)} pages with max 20 concurrent requests")
        
        semaphore = asyncio.Semaphore(20)
        tasks = [
            process_page_async(client, image, i, semaphore)
            for i, image in enumerate(images)
        ]
        
        # Execute all tasks in parallel
        results = await asyncio.gather(*tasks, return_exceptions=False)
        
        print(f"Completed processing all {len(images)} pages")
        
        # Clean up temporary file
        os.unlink(temp_pdf_path)
        
        return JSONResponse(content={
            "success": True,
            "total_pages": len(images),
            "results": results
        })
        
    except Exception as e:
        # Clean up temporary file if it exists
        if 'temp_pdf_path' in locals():
            try:
                os.unlink(temp_pdf_path)
            except:
                pass
        
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")

@app.post("/extract-attendees")
async def extract_attendees(request: TextAnalysisRequest):
    """Extract meeting attendees using OpenAI"""
    
    if not request.api_key:
        raise HTTPException(status_code=400, detail="API key is required")
    
    if not request.text:
        raise HTTPException(status_code=400, detail="Text is required")
    
    try:
        # Initialize OpenAI client with provided API key
        client = OpenAI(api_key=request.api_key)
        
        # Call OpenAI API with the exact format requested for attendees extraction
        response = client.responses.create(
            model="gpt-4.1",
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
                            "text": request.text
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
            reasoning={},
            tools=[],
            temperature=1,
            max_output_tokens=2048,
            top_p=1,
            store=True
        )
        
        return JSONResponse(content=response.output_text)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Extraction failed: {str(e)}")

@app.post("/extract-vote-patterns")
async def extract_vote_patterns(request: TextAnalysisRequest):
    """Extract vote patterns using OpenAI"""
    
    if not request.api_key:
        raise HTTPException(status_code=400, detail="API key is required")
    
    if not request.text:
        raise HTTPException(status_code=400, detail="Text is required")
    
    try:
        # Initialize OpenAI client with provided API key
        client = OpenAI(api_key=request.api_key)
        
        # Call OpenAI API with the exact format requested for vote patterns extraction
        response = client.responses.create(
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
                            "text": request.text
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
                                                            "sponsored",
                                                            "co_sponsored",
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
                "effort": "medium"
            },
            tools=[],
            store=True
        )
        
        return JSONResponse(content=response.output_text)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Extraction failed: {str(e)}")

@app.post("/process-multiple-pdfs")
async def process_multiple_pdfs(
    files: List[UploadFile] = File(...),
    api_key: str = Form(...)
):
    """Process multiple PDF files in parallel through all steps"""
    
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
        
        print(f"Starting parallel processing of {len(files)} PDF files")
        
        # Read all file contents first
        file_contents = []
        for file in files:
            content = await file.read()
            file_contents.append((content, file.filename))
        
        # Process all PDFs in parallel with max 5 concurrent files to avoid API rate limits
        semaphore = asyncio.Semaphore(5)
        tasks = [
            process_single_pdf_complete(client, content, filename, semaphore)
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
        
        print(f"Completed processing all {len(files)} files in {total_processing_time}ms")
        
        return JSONResponse(content={
            "success": True,
            "total_files": len(files),
            "processing_time_ms": total_processing_time,
            "results": processed_results
        })
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Multi-PDF processing failed: {str(e)}")

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)