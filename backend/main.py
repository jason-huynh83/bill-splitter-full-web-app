from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import json
import yaml
import pandas as pd
from openai import OpenAI

# Initialize FastAPI app
app = FastAPI()

# Enable CORS (adjust allowed origins as needed in production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Define a Pydantic model for incoming requests
class ReceiptRequest(BaseModel):
    base64_image: str

def get_dataframe(base64_image: str):
    # Load configuration from config.yaml
    with open("config.yaml", "r") as file:
        config = yaml.safe_load(file)

    # Set the OpenAI API key from the config
    os.environ["OPENAI_API_KEY"] = config["token"]

    # Initialize the OpenAI client
    client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

    # Create the chat completion request with the receipt prompt and image
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "You are being shown receipts from a restaurant. Please correctly parse out all items, quantity and prices in the following receipt shown. "
                            "After parsing the data, You will return the extracted information in a JSON object, using the following schema: "
                            '{ "Quantity": (float), "Item": (string), "price": (float) } '
                            "Do not include markdown formatting in your response. Do not include any explanatory notes. Do not include newline character, dollar or other symbols, stick to strings and numerical notation. Make sure the JSON object is valid"
                        ),
                    },
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"},
                    },
                ],
            }
        ],
    )

    # Extract the response content
    parsed_data = response.choices[0].message.content

    # Attempt to convert the response into Python objects
    try:
        item_list = json.loads(parsed_data)
    except json.JSONDecodeError as e:
        print(f"Error parsing JSON: {e}")
        item_list = []

    # Create a DataFrame from the parsed items if valid data is present
    if item_list:
        df = pd.DataFrame(item_list)
        # Return DataFrame as a JSON string (list of dictionaries)
        return df.to_json(orient="records")
    else:
        return None

# Define a POST endpoint to accept the receipt image (as a base64 string)
@app.post("/parse_receipt")
def parse_receipt(request: ReceiptRequest):
    result_json = get_dataframe(request.base64_image)
    if result_json:
        # Return the parsed JSON data to the client
        return {"parsed_data": json.loads(result_json)}
    else:
        raise HTTPException(status_code=400, detail="Could not parse receipt data")

@app.get("/")
def read_root():
    return {"message": "Hello from FastAPI!"}
