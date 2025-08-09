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