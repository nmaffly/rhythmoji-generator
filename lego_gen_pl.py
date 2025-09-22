from openai import OpenAI
import base64, os
import requests
from dotenv import load_dotenv

load_dotenv()  # loads OPENAI_API_KEY from .env

api_key = os.getenv("OPENAI_API_KEY")
print(f'api_key: {api_key}')
assert api_key, "OPENAI_API_KEY is missing"
client = OpenAI(api_key=api_key)

def edit_lego_head(base_image_path, animal_name):
    """
    Edit a LEGO figure's head to be an animal
    
    Args:
        base_image_path: Path to the base LEGO figure image
        animal_name: The animal head to generate (e.g., "red panda", "bear")
    """
    
    prompt = (
        f"Replace the head of this LEGO minifigure with a {animal_name} head. "
        "Make it look like a LEGO-style {animal_name} head that fits naturally. Do not make it too realistic "
        "Replace the shirt with a wife beater. "  
        f"Add a crown on the {animal_name} head. "
        "Replace the pants with khakis."
        "Add a pair of cowboy boots."
        "Make the hands/arms the same color as the {animal_name}, but still lego-style."
        "Keep and pose exactly the same (exactly front on, no side view) "
        "Add realistic lighting so it looks like a real LEGO figure, and get get rid of gridlines."
        # "Maintain the same lighting and style as the original figure."
    )
    
    try:
        result = client.images.edit(
            model="gpt-image-1",
            image=open(base_image_path, "rb"),
            prompt=prompt,
            size="1024x1024",
            quality="high"
        )
        
        print("API call successful!")
        
        if result.data and len(result.data) > 0:
            image_data = result.data[0]
            
            # Check if we have base64 data or URL
            if image_data.b64_json:
                # Use base64 data
                output_filename = f"lego_{animal_name.replace(' ', '_')}.png"
                with open(output_filename, "wb") as f:
                    f.write(base64.b64decode(image_data.b64_json))
                print(f"Saved: {output_filename} (from base64)")
                return output_filename
            elif image_data.url:
                # Download from URL
                print(f"Downloading from URL: {image_data.url}")
                response = requests.get(image_data.url)
                response.raise_for_status()
                
                output_filename = f"lego_{animal_name.replace(' ', '_')}.png"
                with open(output_filename, "wb") as f:
                    f.write(response.content)
                print(f"Saved: {output_filename} (from URL)")
                return output_filename
            else:
                print("Error: No image data found in response")
                return None
        else:
            print("Error: No data in result")
            return None
            
    except Exception as e:
        print(f"Error during API call: {e}")
        print(f"Error type: {type(e)}")
        return None

# Example usage
if __name__ == "__main__":
    # Edit the LEGO head
    result = edit_lego_head("base_lego_3d.png", "dog")
    
    if result:
        print(f"Successfully created: {result}")
    else:
        print("Failed to create image")
