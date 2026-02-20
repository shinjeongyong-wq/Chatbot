import json

def extract_all_text(filepath):
    d = json.loads(open(filepath, encoding='utf-8').read())
    has_more = d.get('has_more', False)
    next_cursor = d.get('next_cursor', None)
    texts = []
    for b in d.get('results', []):
        bt = b.get('type','')
        content = ''
        if bt in ('heading_1','heading_2','heading_3'):
            rt = b[bt].get('rich_text',[])
            txt = ''.join([t.get('plain_text','') for t in rt])
            prefix = '#' * int(bt[-1])
            content = f'{prefix} {txt}'
        elif bt == 'paragraph':
            rt = b[bt].get('rich_text',[])
            txt = ''.join([t.get('plain_text','') for t in rt])
            if txt.strip():
                content = txt
        elif bt == 'bulleted_list_item':
            rt = b[bt].get('rich_text',[])
            txt = ''.join([t.get('plain_text','') for t in rt])
            content = f'- {txt}'
        elif bt == 'numbered_list_item':
            rt = b[bt].get('rich_text',[])
            txt = ''.join([t.get('plain_text','') for t in rt])
            content = f'NUM. {txt}'
        elif bt == 'toggle':
            rt = b[bt].get('rich_text',[])
            txt = ''.join([t.get('plain_text','') for t in rt])
            content = f'TOGGLE: {txt}'
        elif bt == 'callout':
            rt = b[bt].get('rich_text',[])
            txt = ''.join([t.get('plain_text','') for t in rt])
            content = f'CALLOUT: {txt}'
        elif bt == 'divider':
            content = '---'
        if content:
            texts.append(content)
    return texts, has_more, next_cursor

base = r'C:\Users\jeong\.gemini\antigravity\brain\30037c04-719d-4eaa-94ba-7f586b4cd94d\.system_generated\steps'

out = open('temp_batch4.txt', 'w', encoding='utf-8')
for step, name in [('430','가구'), ('434','운영지원인프라')]:
    texts, hm, nc = extract_all_text(f'{base}/{step}/output.txt')
    out.write(f'========== {name} (has_more={hm}, next_cursor={nc}) ==========\n')
    for t in texts:
        out.write(t + '\n')
    out.write('\n')
out.close()
print('Done')
