from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os, json, yaml, pandas as pd
from openai import OpenAI
from mangum import Mangum  # Adapter for serverless environments

app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ReceiptRequest(BaseModel):
    base64_image: str

def get_dataframe(base64_image: str):
    with open("config.yaml", "r") as file:
        config = yaml.safe_load(file)
    os.environ["OPENAI_API_KEY"] = config["token"]
    client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "You are being shown receipts from a restaurant. Please correctly parse out all items, quantity and prices in the following receipt. "
                            "Return the extracted information in a JSON object using this schema: "
                            '{ "Quantity": (float), "Item": (string), "price": (float) } '
                            "Do not include markdown formatting, notes, or extra symbols."
                        ),
                    },
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"}
                    }
                ],
            }
        ],
    )
    parsed_data = response.choices[0].message.content
    try:
        item_list = json.loads(parsed_data)
    except json.JSONDecodeError as e:
        print(f"Error parsing JSON: {e}")
        item_list = []
    if item_list:
        df = pd.DataFrame(item_list)
        return df.to_json(orient="records")
    else:
        return None

@app.post("/parse_receipt")
def parse_receipt(request: ReceiptRequest):
    result_json = get_dataframe(request.base64_image)
    if result_json:
        return {"parsed_data": json.loads(result_json)}
    else:
        raise HTTPException(status_code=400, detail="Could not parse receipt data")

@app.get("/")
def read_root():
    return {"message": "Hello from FastAPI!"}

# This is the entry point for the serverless function
handler = Mangum(app)
