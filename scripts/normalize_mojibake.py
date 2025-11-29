#!/usr/bin/env python3
"""
Normalize mojibake in orders and invoices JSON files.
Multi-pass Latin-1 -> UTF-8 decoding plus direct replacements for Turkish characters
and common punctuation artifacts.
"""
import json, re, os, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ORDERS = ROOT / 'orders'
INVOICES = ROOT / 'invoices'

MOJIBAKE_RE = re.compile(r'(Ã|Ä|Å|â‚º|ğŸ|â•)')
DIRECT_MAP = [
    # Single-pass forms
    ('Ãœ','Ü'),('Ã¼','ü'),('Ã‡','Ç'),('Ã§','ç'),('Ã–','Ö'),('Ã¶','ö'),('ÄŸ','ğ'),('ÅŸ','ş'),('Ä±','ı'),('Ä°','İ'),('â‚º','₺'),
    ('â€™',"'"),('â€œ','"'),('â€�','"'),('â€“','–'),('â€”','—'),
    # Double-encoded common Turkish letters
    ('ÃÂ¼','ü'),('ÃÂœ','Ü'),('ÃÂ§','ç'),('ÃÂ¶','ö'),('ÃÂ','Ğ'),('ÃÂ','Ü'),('ÃÂ','ß'),
    ('ÃÂ±','ı'),('ÃÂ°','İ'),('ÃÂ','ğ'),('ÃÂ','ş'),
]

def byte_redecode(s:str)->str:
    try:
        b = bytes([ord(c) & 0xFF for c in s])
        return b.decode('utf-8')
    except Exception:
        return s

def iterative_decode(s:str)->str:
    cur = s
    for _ in range(6):
        # Try latin1->utf8 route
        try:
            nxt = cur.encode('latin1').decode('utf-8')
            if nxt != cur:
                cur = nxt
                continue
        except Exception:
            pass
        # Try raw byte re-decode
        rede = byte_redecode(cur)
        if rede != cur:
            cur = rede
            continue
        break
    return cur

def fix_text(s:str)->str:
    if not isinstance(s,str):
        return s
    if not MOJIBAKE_RE.search(s):
        return s
    out = iterative_decode(s)
    # Apply mapping, then attempt one more iterative decode if markers remain
    for src,dst in DIRECT_MAP:
        out = out.replace(src,dst)
    if MOJIBAKE_RE.search(out):
        out = iterative_decode(out)
        for src,dst in DIRECT_MAP:
            out = out.replace(src,dst)
    return out

def walk(value):
    if isinstance(value, dict):
        return {k: walk(v) for k,v in value.items()}
    if isinstance(value, list):
        return [walk(v) for v in value]
    if isinstance(value, str):
        return fix_text(value)
    return value

def process_dir(dir_path:Path,label:str):
    if not dir_path.exists():
        print(f"{label} missing: {dir_path}")
        return 0,0
    ok=0; fail=0
    for f in sorted(dir_path.glob('*.json')):
        try:
            raw = f.read_bytes()
            text = raw.decode('utf-8', errors='replace')
            try:
                obj = json.loads(text)
            except json.JSONDecodeError:
                # attempt latin1 then fix
                text2 = raw.decode('latin1', errors='replace')
                try:
                    obj = json.loads(text2)
                except json.JSONDecodeError:
                    # final attempt: iterative decode of entire string before parse (rare)
                    fixed = iterative_decode(text2)
                    obj = json.loads(fixed)
            fixed_obj = walk(obj)
            new_text = json.dumps(fixed_obj, ensure_ascii=False, indent=2) + '\n'
            f.write_text(new_text, encoding='utf-8')
            ok += 1
        except Exception as e:
            print('FAIL', f, e)
            fail += 1
    return ok, fail

def main():
    o_ok,o_fail = process_dir(ORDERS,'Orders')
    i_ok,i_fail = process_dir(INVOICES,'Invoices')
    print(f"Orders normalized: {o_ok} ok, {o_fail} failed")
    print(f"Invoices normalized: {i_ok} ok, {i_fail} failed")

if __name__ == '__main__':
    main()
