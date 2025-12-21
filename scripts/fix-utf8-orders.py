#!/usr/bin/env python3
"""
Fix Turkish character encoding in orders/*.json and invoices/*.json files.
Handles broken UTF-8 sequences caused by Latin-1 decoding of UTF-8 bytes.

Common patterns:
- "Ã¼" → "ü"
- "Ã§" → "ç"
- "ÄŸ" → "ğ"
- "Ä±" → "ı"
"""

import json
import os
import glob
import re
import base64
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
ROOT_DIR = SCRIPT_DIR.parent
ORDERS_DIR = ROOT_DIR / "orders"
INVOICES_DIR = ROOT_DIR / "invoices"

# Mapping of broken UTF-8 sequences (UTF-8 bytes interpreted as Latin-1)
CHAR_MAP = {
    'Ã¼': 'ü', 'Ã¶': 'ö', 'ÅŸ': 'ş', 'Ä±': 'ı', 'ÄŸ': 'ğ', 'Ã§': 'ç',
    'Ãœ': 'Ü', 'Ã–': 'Ö', 'Åž': 'Ş', 'Ä°': 'İ', 'Äž': 'Ğ', 'Ã‡': 'Ç',
    'â‚º': '₺', 'â€™': "'", 'â€œ': '"', 'â€˜': ''', 'â€"/': '–', 'â€"': '—',
}

def fix_string(text):
    """Apply all character mappings to fix mojibake."""
    if not isinstance(text, str):
        return text
    result = text
    for broken, correct in CHAR_MAP.items():
        result = result.replace(broken, correct)
    return result

def fix_value(val):
    """Recursively fix strings in any value."""
    if isinstance(val, str):
        return fix_string(val)
    elif isinstance(val, dict):
        return {k: fix_value(v) for k, v in val.items()}
    elif isinstance(val, list):
        return [fix_value(item) for item in val]
    return val

def process_json_file(filepath):
    """Read JSON file, fix broken characters, and write back."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Try to parse as JSON
        try:
            data = json.loads(content)
        except json.JSONDecodeError:
            print(f"  ⚠️  Cannot parse JSON: {filepath}")
            return False
        
        # Fix all string values
        fixed_data = fix_value(data)
        
        # Check if anything changed
        fixed_json = json.dumps(fixed_data, indent=2, ensure_ascii=False)
        
        if fixed_json == content:
            print(f"  ✓ No changes: {filepath.name}")
            return False
        
        # Write back
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(fixed_json)
        
        print(f"  ✅ Fixed: {filepath.name}")
        return True
    except Exception as e:
        print(f"  ❌ Error: {filepath.name} - {e}")
        return False

def main():
    print("🔧 Fixing UTF-8 encoding in order files...\n")
    
    fixed_count = 0
    
    # Process orders directory
    if ORDERS_DIR.exists():
        print(f"📁 Processing {ORDERS_DIR.name}:")
        for order_file in sorted(ORDERS_DIR.glob("*.json")):
            if process_json_file(order_file):
                fixed_count += 1
    
    # Process invoices directory
    if INVOICES_DIR.exists():
        print(f"\n📁 Processing {INVOICES_DIR.name}:")
        for invoice_file in sorted(INVOICES_DIR.glob("*.json")):
            if process_json_file(invoice_file):
                fixed_count += 1
    
    print(f"\n{'='*50}")
    print(f"✨ Done! Fixed {fixed_count} files.")
    print(f"\nNext: git add orders/ invoices/ && git commit -m 'fix: correct UTF-8 encoding in order files'")

if __name__ == '__main__':
    main()
