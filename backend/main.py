from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import os
import tempfile
import base64
from io import BytesIO
from PIL import Image
from pdf2image import convert_from_path
from openai import OpenAI
from typing import List
import json

app = FastAPI(title="PDF Processing API")

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

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)