# LEGO Clothing Editor Pipeline

A powerful pipeline that uses GPT-4 Vision and DALL-E to analyze LEGO figures and edit their clothing items. This tool can automatically identify current clothing on a LEGO minifigure and generate new images with modified clothing while maintaining the authentic LEGO style.

## Features

- **Automatic LEGO Analysis**: Uses GPT-4 Vision to analyze existing LEGO figures and identify current clothing items
- **Intelligent Clothing Editing**: Generates new LEGO figures with modified clothing using DALL-E 3
- **Batch Processing**: Create multiple clothing variations from a single base figure
- **Authentic LEGO Style**: Maintains proper LEGO proportions and plastic texture
- **Flexible Editing**: Add, replace, or remove clothing items with precise control

## Setup

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Set up OpenAI API Key

Create a `.env` file in the project directory:

```bash
echo "OPENAI_API_KEY=your_openai_api_key_here" > .env
```

Or set the environment variable directly:

```bash
export OPENAI_API_KEY="your_openai_api_key_here"
```

### 3. Prepare Your LEGO Figure Image

Place your LEGO figure image in the project directory. The image should be:
- Clear and well-lit
- Show the full LEGO figure
- Preferably against a simple background
- Named `base_lego_figure.jpg` (or update the path in the code)

## Usage

### Basic Usage

```python
from lego_gen_pl import LEGOClothingEditor
import os

# Initialize the editor
api_key = os.getenv("OPENAI_API_KEY")
editor = LEGOClothingEditor(api_key)

# Analyze a LEGO figure
lego_figure = editor.analyze_lego_figure("base_lego_figure.jpg")

# Define clothing changes
clothing_changes = [
    {
        "action": "add",
        "description": "red superhero cape",
        "position": "back"
    }
]

# Generate the edited figure
output_path = editor.edit_lego_clothing(lego_figure, clothing_changes)
```

### Running Examples

```bash
# Run the example script
python example_usage.py

# Or run the main pipeline
python lego_gen_pl.py
```

## Clothing Change Actions

The pipeline supports three types of clothing changes:

### 1. Add New Items
```python
{
    "action": "add",
    "description": "red superhero cape",
    "position": "back"
}
```

### 2. Replace Existing Items
```python
{
    "action": "replace",
    "old_item": "current shirt",
    "description": "blue superhero costume",
    "position": "upper body"
}
```

### 3. Remove Items
```python
{
    "action": "remove",
    "item": "current hat"
}
```

## Example Scenarios

### Superhero Transformation
```python
clothing_changes = [
    {
        "action": "replace",
        "old_item": "current shirt",
        "description": "blue superhero costume with red cape",
        "position": "upper body"
    },
    {
        "action": "add",
        "description": "gold utility belt",
        "position": "waist"
    }
]
```

### Firefighter Outfit
```python
clothing_changes = [
    {
        "action": "replace",
        "old_item": "current shirt",
        "description": "yellow firefighter uniform with reflective stripes",
        "position": "upper body"
    },
    {
        "action": "add",
        "description": "red firefighter helmet",
        "position": "head"
    },
    {
        "action": "add",
        "description": "black boots",
        "position": "feet"
    }
]
```

### Ninja Costume
```python
clothing_changes = [
    {
        "action": "replace",
        "old_item": "current shirt",
        "description": "black ninja outfit with red trim",
        "position": "upper body"
    },
    {
        "action": "add",
        "description": "black ninja mask",
        "position": "face"
    },
    {
        "action": "add",
        "description": "black ninja hood",
        "position": "head"
    }
]
```

## Batch Processing

Generate multiple variations at once:

```python
scenarios = [
    # Scenario 1: Firefighter
    [
        {"action": "replace", "old_item": "current shirt", "description": "firefighter uniform", "position": "upper body"},
        {"action": "add", "description": "firefighter helmet", "position": "head"}
    ],
    # Scenario 2: Ninja
    [
        {"action": "replace", "old_item": "current shirt", "description": "ninja outfit", "position": "upper body"},
        {"action": "add", "description": "ninja mask", "position": "face"}
    ]
]

output_paths = editor.batch_edit_clothing(lego_figure, scenarios)
```

## API Reference

### LEGOClothingEditor Class

#### Methods

- `analyze_lego_figure(image_path: str) -> LEGOFigure`
  - Analyzes a LEGO figure image and returns structured data about current clothing

- `edit_lego_clothing(lego_figure: LEGOFigure, clothing_changes: List[Dict], output_path: str = "edited_lego.png") -> str`
  - Generates a new LEGO figure with the specified clothing changes

- `batch_edit_clothing(lego_figure: LEGOFigure, clothing_scenarios: List[List[Dict]]) -> List[str]`
  - Generates multiple variations from different clothing scenarios

### Data Structures

#### ClothingItem
```python
@dataclass
class ClothingItem:
    item_type: str      # e.g., "shirt", "pants", "hat"
    description: str    # e.g., "red superhero cape"
    position: str       # e.g., "upper body", "lower body", "head"
    confidence: float   # 0.0-1.0 confidence level
```

#### LEGOFigure
```python
@dataclass
class LEGOFigure:
    image_path: str
    current_clothing: List[ClothingItem]
    figure_pose: str    # e.g., "standing", "sitting"
    background: str     # e.g., "studio", "outdoor"
```

## Tips for Best Results

1. **Image Quality**: Use high-quality, well-lit images of LEGO figures
2. **Simple Backgrounds**: Plain backgrounds work better than complex scenes
3. **Clear Descriptions**: Be specific about colors, styles, and positions
4. **Authentic LEGO Terms**: Use terms like "LEGO minifigure", "plastic texture", "authentic LEGO pieces"
5. **Position Accuracy**: Use precise position descriptions (upper body, lower body, head, etc.)

## Troubleshooting

### Common Issues

1. **API Key Error**: Ensure your OpenAI API key is set correctly
2. **Image Not Found**: Check that your LEGO figure image path is correct
3. **Poor Results**: Try adjusting clothing descriptions or using more specific LEGO terminology
4. **Rate Limits**: The pipeline respects OpenAI's rate limits; add delays between requests if needed

### Error Handling

The pipeline includes comprehensive error handling and logging. Check the console output for detailed error messages and suggestions.

## Requirements

- Python 3.7+
- OpenAI API key with access to GPT-4 Vision and DALL-E 3
- Internet connection for API calls

## Dependencies

- `requests`: HTTP requests to OpenAI API
- `Pillow`: Image processing
- `python-dotenv`: Environment variable management

## License

This project is open source. Feel free to modify and distribute according to your needs.

## Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues for bugs and feature requests.

