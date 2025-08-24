from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
import os
import tempfile
import base64
from io import BytesIO
from PIL import Image
from pdf2image import convert_from_path
from openai import OpenAI
from typing import List, Callable, Optional
import json
import asyncio
import aiofiles

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

async def process_single_page(client: OpenAI, image: Image.Image, page_num: int, semaphore: asyncio.Semaphore, filename: str = "", progress_callback: Optional[Callable] = None) -> dict:
    """Process a single page with rate limiting"""
    async with semaphore:
        try:
            # Convert image to base64
            image_base64 = image_to_base64(image)
            
            # Call OpenAI API
            response = client.responses.create(
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
            
            result = {
                "page": page_num,
                "response": response.output_text
            }
            
            if progress_callback:
                await progress_callback("page_completed", {
                    "filename": filename,
                    "page": page_num,
                    "success": True,
                    "result": result
                })
            
            return result
            
        except Exception as e:
            result = {
                "page": page_num,
                "error": f"Failed to process page {page_num}: {str(e)}"
            }
            
            if progress_callback:
                await progress_callback("page_completed", {
                    "filename": filename,
                    "page": page_num,
                    "success": False,
                    "result": result
                })
            
            return result

async def process_single_pdf(file_content: bytes, filename: str, client: OpenAI, semaphore: asyncio.Semaphore, progress_callback: Optional[Callable] = None) -> dict:
    """Process a single PDF file and return results for all its pages"""
    temp_pdf_path = None
    try:
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as temp_file:
            temp_file.write(file_content)
            temp_pdf_path = temp_file.name
        
        # Convert PDF pages to images
        try:
            images = convert_from_path(temp_pdf_path)
        except Exception as e:
            raise Exception(f"Failed to convert PDF {filename}: {str(e)}")
        
        if progress_callback:
            await progress_callback("pdf_started", {
                "filename": filename,
                "total_pages": len(images)
            })
        
        # Process all pages in parallel
        page_tasks = [
            process_single_page(client, image, i + 1, semaphore, filename, progress_callback)
            for i, image in enumerate(images)
        ]
        
        page_results = await asyncio.gather(*page_tasks)
        
        result = {
            "filename": filename,
            "success": True,
            "total_pages": len(images),
            "results": page_results
        }
        
        if progress_callback:
            await progress_callback("pdf_completed", result)
        
        return result
        
    except Exception as e:
        return {
            "filename": filename,
            "success": False,
            "error": str(e),
            "results": []
        }
    finally:
        # Clean up temporary file
        if temp_pdf_path and os.path.exists(temp_pdf_path):
            try:
                os.unlink(temp_pdf_path)
            except:
                pass

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
        
        # Process each page with OpenAI
        results = []
        
        for i, image in enumerate(images):
            try:
                # Convert image to base64
                image_base64 = image_to_base64(image)
                
                # Call OpenAI API with the exact format requested
                response = client.responses.create(
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
                
                results.append({
                    "page": i + 1,
                    "response": response.output_text
                })
                
            except Exception as e:
                results.append({
                    "page": i + 1,
                    "error": f"Failed to process page {i + 1}: {str(e)}"
                })
        
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

@app.post("/process-multiple-pdfs")
async def process_multiple_pdfs(
    files: List[UploadFile] = File(...),
    api_key: str = Form(...)
):
    """Process multiple PDF files in parallel"""
    
    if not files:
        raise HTTPException(status_code=400, detail="At least one PDF file is required")
    
    for file in files:
        if not file.filename.endswith('.pdf'):
            raise HTTPException(status_code=400, detail=f"File {file.filename} must be a PDF")
    
    if not api_key:
        raise HTTPException(status_code=400, detail="OpenAI API key is required")
    
    try:
        # Initialize OpenAI client
        client = OpenAI(api_key=api_key)
        
        # Create semaphore to limit concurrent API calls (10 concurrent requests max)
        semaphore = asyncio.Semaphore(10)
        
        # Read all files asynchronously
        file_contents = []
        for file in files:
            content = await file.read()
            file_contents.append((content, file.filename))
        
        # Process all PDFs in parallel
        pdf_tasks = [
            process_single_pdf(content, filename, client, semaphore)
            for content, filename in file_contents
        ]
        
        pdf_results = await asyncio.gather(*pdf_tasks)
        
        # Concatenate all successful results
        all_pages = []
        total_pages_processed = 0
        failed_files = []
        
        for pdf_result in pdf_results:
            if pdf_result["success"]:
                # Add filename context to each page result
                for page_result in pdf_result["results"]:
                    page_result["source_file"] = pdf_result["filename"]
                    all_pages.append(page_result)
                total_pages_processed += pdf_result["total_pages"]
            else:
                failed_files.append({
                    "filename": pdf_result["filename"],
                    "error": pdf_result["error"]
                })
        
        # Concatenate all extracted text
        concatenated_text = ""
        for page in all_pages:
            if "response" in page and not page.get("error"):
                try:
                    parsed = json.loads(page["response"])
                    text = parsed.get("text", page["response"])
                    concatenated_text += f"\n\n--- {page['source_file']} - Page {page['page']} ---\n{text}"
                except:
                    concatenated_text += f"\n\n--- {page['source_file']} - Page {page['page']} ---\n{page['response']}"
        
        return JSONResponse(content={
            "success": True,
            "total_files": len(files),
            "total_pages_processed": total_pages_processed,
            "failed_files": failed_files,
            "pdf_results": pdf_results,
            "concatenated_text": concatenated_text.strip()
        })
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")

@app.post("/process-multiple-pdfs-stream")
async def process_multiple_pdfs_stream(
    files: List[UploadFile] = File(...),
    api_key: str = Form(...)
):
    """Process multiple PDF files in parallel with real-time progress updates via SSE"""
    
    if not files:
        raise HTTPException(status_code=400, detail="At least one PDF file is required")
    
    for file in files:
        if not file.filename.endswith('.pdf'):
            raise HTTPException(status_code=400, detail=f"File {file.filename} must be a PDF")
    
    if not api_key:
        raise HTTPException(status_code=400, detail="OpenAI API key is required")

    async def generate_progress():
        try:
            # Initialize OpenAI client
            client = OpenAI(api_key=api_key)
            
            # Create semaphore to limit concurrent API calls
            semaphore = asyncio.Semaphore(10)
            
            # Progress tracking
            progress_data = {
                "total_files": len(files),
                "files_started": 0,
                "files_completed": 0,
                "total_pages": 0,
                "pages_completed": 0,
                "pdf_results": [],
                "failed_files": []
            }
            
            async def progress_callback(event_type: str, data: dict):
                if event_type == "pdf_started":
                    progress_data["files_started"] += 1
                    progress_data["total_pages"] += data["total_pages"]
                    
                elif event_type == "page_completed":
                    progress_data["pages_completed"] += 1
                    
                elif event_type == "pdf_completed":
                    progress_data["files_completed"] += 1
                    if data["success"]:
                        progress_data["pdf_results"].append(data)
                    else:
                        progress_data["failed_files"].append({
                            "filename": data["filename"],
                            "error": data.get("error", "Unknown error")
                        })
                
                # Emit progress event
                event_data = {
                    "event_type": event_type,
                    "data": data,
                    "progress": progress_data.copy()
                }
                
                yield f"data: {json.dumps(event_data)}\n\n"
            
            # Read all files
            file_contents = []
            for file in files:
                content = await file.read()
                file_contents.append((content, file.filename))
            
            # Process all PDFs in parallel
            pdf_tasks = [
                process_single_pdf(content, filename, client, semaphore, progress_callback)
                for content, filename in file_contents
            ]
            
            pdf_results = await asyncio.gather(*pdf_tasks)
            
            # Concatenate all successful results
            all_pages = []
            concatenated_text = ""
            
            for pdf_result in pdf_results:
                if pdf_result["success"]:
                    for page_result in pdf_result["results"]:
                        page_result["source_file"] = pdf_result["filename"]
                        all_pages.append(page_result)
            
            # Build concatenated text
            for page in all_pages:
                if "response" in page and not page.get("error"):
                    try:
                        parsed = json.loads(page["response"])
                        text = parsed.get("text", page["response"])
                        concatenated_text += f"\n\n--- {page['source_file']} - Page {page['page']} ---\n{text}"
                    except:
                        concatenated_text += f"\n\n--- {page['source_file']} - Page {page['page']} ---\n{page['response']}"
            
            # Final completion event
            final_result = {
                "success": True,
                "total_files": len(files),
                "total_pages_processed": progress_data["pages_completed"],
                "failed_files": progress_data["failed_files"],
                "pdf_results": progress_data["pdf_results"],
                "concatenated_text": concatenated_text.strip()
            }
            
            yield f"data: {json.dumps({'event_type': 'all_completed', 'data': final_result})}\n\n"
            
        except Exception as e:
            error_data = {
                "event_type": "error",
                "data": {"error": str(e)}
            }
            yield f"data: {json.dumps(error_data)}\n\n"
    
    return StreamingResponse(
        generate_progress(),
        media_type="text/plain",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Content-Type": "text/event-stream",
        }
    )

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

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)