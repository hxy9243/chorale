"""Count saved payload text with a declared reference tokenizer, never char/4."""
import json
import pathlib
import sys

sys.path.insert(0, '/tmp/chorale-context-tokenizer')
import tiktoken

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/reviews/music21-context-2026-10-24'
ENC = tiktoken.get_encoding('o200k_base')


def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))


def count(value):
    return len(ENC.encode(value if isinstance(value, str) else compact(value)))


saved = json.loads((ROOT / 'docs/reviews/music21-python-2026-10-23/electron/provider-requests.json').read_text())
schema = next(t for t in saved['requests'][0]['tools'] if t['function']['name'] == 'analyze_music21')
def measure(items):
  rows = []
  for item in items:
    rows.append({
        'measures': item['bars'], 'calls': len(item['calls']),
        'abcTokens': count(item['abc']),
        'pythonCallArgumentsTokens': sum(count(c['arguments']) for c in item['calls']),
        'resultTokens': sum(count(c['result']) for c in item['calls']),
        'musicalResultOnlyTokens': sum(count(c['result']['result']) for c in item['calls']),
        'rawEventDumpTokens': sum(count(c['rawInput']) for c in item['calls']),
        'sandboxMs': sum(c['result']['durationMs'] for c in item['calls']),
        'pitchedEvents': sum(c['result']['inputSummary']['pitchedEvents'] for c in item['calls']),
    })
    rows[-1]['addedCallAndResultTokens'] = rows[-1]['pythonCallArgumentsTokens'] + rows[-1]['resultTokens']
  return rows


rows = measure(json.loads((OUT / 'context-payloads.json').read_text()))
density_rows = measure(json.loads((OUT / 'density-payloads.json').read_text())) if (OUT / 'density-payloads.json').exists() else []
pairs = []
for c in json.loads((OUT / 'cases.json').read_text())['cases']:
    pair = {'id': c['id'], 'measures': c['bars']}
    for arm in ['before', 'after']:
        response = json.loads((OUT / f"{c['id']}-{arm}-response.json").read_text())
        req = json.loads((OUT / f"{c['id']}-{arm}-request.json").read_text())
        pair[arm] = {
            'model': response['body']['model'], 'provider': response['body'].get('provider'),
            'usage': response['body'].get('usage'), 'latencyMs': response['latencyMs'],
            'messageContentReferenceTokens': sum(count(m['content']) for m in req['messages']),
            'finishReason': response['body']['choices'][0]['finish_reason'],
        }
    pair['providerPromptTokenDelta'] = pair['after']['usage']['prompt_tokens'] - pair['before']['usage']['prompt_tokens']
    pairs.append(pair)
result = {
    'tokenizer': 'tiktoken o200k_base: exact counts for this encoding only; not the GLM tokenizer or provider framing',
    'toolSchemaTokens': count(schema),
    'schemaBytes': len(compact(schema).encode()),
    'contextRows': rows, 'quarterNoteRearticulationRows': density_rows, 'livePairs': pairs,
    'notes': [
        'Code, call arguments and result enter the conversation; Python implementation, imports and internal event arrays do not enter unless returned or printed.',
        'Schema is an additional persistent tool-definition overhead per request. Prior score-read and profile tools are existing baseline overhead, excluded from these deltas.',
        'Call/result text counts exclude provider role/tool framing and full general chat history. The live pairs instead isolate evidence supplied as an extra user message, without autonomous tool use.',
        'Raw event dump column is a hypothetical alternative, not an additional payload in the measured tool result.',
        '20 measures use 1-16 and 17-20; analysis across the boundary needs explicit surrounding context.',
        'Provider routing is recorded per response; same requested model/settings do not fix backend infrastructure.',
    ],
}
(OUT / 'context-metrics.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
