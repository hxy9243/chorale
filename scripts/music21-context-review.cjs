// Bounded live paired review. Credentials stay inside this Electron main process.
const { app, safeStorage } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'docs/reviews/music21-context-2026-10-24');
app.setName('Chorale');
app.setPath('userData', path.join(os.tmpdir(), `chorale-context-${process.pid}`));
const code = `chords = []
for c in score.chordify().recurse().getElementsByClass('Chord'):
    chords.append({'m': c.measureNumber, 't': str(c.offset), 'p': [p.nameWithOctave for p in c.pitches], 'b': c.bass().nameWithOctave, 'r': c.root().name, 'q': c.quality, 'i': c.inversion()})
ranges = []
for part in score.parts:
    pitches = [n.pitch for n in part.recurse().notes if n.isNote]
    if pitches:
        ranges.append({'voice': part.id, 'low': min(pitches).nameWithOctave, 'high': max(pitches).nameWithOctave})
result = {'sonorities': chords, 'ranges': ranges}
`;
function score(title, voices, key = 'C') {
  return `X:1\nT:${title}\nM:4/4\nL:1/4\nK:${key}\n` + voices.map((v,i) => `V:${i+1}${i===3?' clef=bass':''}\n${v.join(' | ')} |]`).join('\n');
}
const long = [
 ['e','c','G','C,'], ['f','c','A','F,'], ['e','c','G','E,'], ['d','B','G','G,,'],
 ['d','B','^G','E,'], ['e','c','A','A,,'], ['f','d','A','F,'], ['d','B','G','G,,'],
 ['e','c','A','A,,'], ['f','d','A','D,'], ['f','B','D','G,,'], ['e','c','G','C,'],
 ['f','c','A','F,'], ['e','c','G','C,'], ['d','B','G','G,,'], ['e','c','A','A,,'],
 ['f','d','A','D,'], ['f','B','D','G,,'], ['e','c','G','C,'], ['e','c','G','C,'],
];
const cases = [
 { id:'04-cadence', bars:4, abc:score('Four-bar cadence', [['B4','c4','A4','G4'],['G4','G4','^F4','D4'],['D4','E4','D4','B,4'],['G,,4','C,4','D,4','G,,4']], 'G'),
   focus:'Identify the four harmonies and their basses; does the final cadence meet the strict soprano-and-bass condition for a perfect authentic cadence?',
   checks:[{id:'harmonies',expected:'G major, C major, D major, G major, all root position'},{id:'cadence',expected:'Final V-I has D3-G2 in bass and A4-G4 in soprano: root-position dominant and tonic, soprano ends on tonic; PAC in this schematic metrical context.'}] },
 { id:'08-suspension', bars:8, abc:score('Suspension study', [['e4','f4','e4','c4-','c B3','e4','d4','c4'],['G4','A4','G4','A4','D4','c4','B4','G4'],['E4','F4','E4','F4','G,4','E4','F4','E4'],['C,4','F,4','C,4','F,4','G,,4','A,,4','G,,4','C,4']]),
   focus:'Explain the event across measures 4-5, identify the harmony and inversion in measures 5-7, and give one student revision suggestion without treating every vertical slice as a new functional chord.',
   checks:[{id:'suspension',expected:'C5 is prepared in m4, tied over G bass on beat1 m5, resolves downward to B4 on beat2: 4-3 suspension.'},{id:'harmony',expected:'m5 dominant G after suspension; m6 A minor root position; m7 G7 root position.'},{id:'revision',expected:'Keep the expressive suspension; treat any revision as an optional student choice, with concrete location and purpose.'}] },
 { id:'20-secondary', bars:20, abc:score('Twenty-bar sketch', [0,1,2,3].map(v=>long.map(c=>c[v]+'4'))),
   focus:'Give a basic harmonic and phrase overview. Identify any applied dominant and resolution, inversions in measures 3 and 7, the sonority in measure 11, and whether G-sharp from measure 5 affects measure 13. Distinguish score facts from tentative formal or aesthetic judgments.',
   checks:[{id:'applied-dominant',expected:'m5 E7 (E3 G#4 B4 D5), V7/vi, resolves to Am in m6.'},{id:'inversions',expected:'m3 C/E first inversion; m7 Dm/F first inversion.'},{id:'dominant-seventh',expected:'m11 G7, not F major or a root-position B diminished chord.'},{id:'accidental',expected:'G# in m5 is local to the bar; m13 contains F A C, no G/G# at all. No cross-bar sharp inference.'},{id:'form',expected:'Any phrase grouping such as 4+4+4+4+4 is tentative from notation; lack of rhythm variety makes strong narrative judgments unsupported.'}] },
];
const system = 'You are a careful music tutor helping a student revise a short score. Analyze only the supplied notation. Be concrete about measure numbers, pitches and bass. Separate literal sonorities, harmonic interpretation, and aesthetic judgment. Computed root/quality guesses may be wrong around non-chord tones. Respond in at most 400 words. Do not invent missing information.';
async function write(name, value) { await fs.writeFile(path.join(output,name), JSON.stringify(value,null,2)+'\n'); }
async function main() {
  await fs.mkdir(output,{recursive:true});
  await write('cases.json', {createdAt:new Date().toISOString(), cases, system, code, protocol:'Three independent paired calls, all baselines frozen before computing evidence. Same model/settings/base messages. Evidence arm receives fixed real music21 results as an additional user message. This tests supplied evidence, not autonomous tool selection. Checks are author-generated, reviewable expectations; not an external gold dataset.'});
  const stored = JSON.parse(await fs.readFile('/home/kevin/.config/Chorale/chorale-data/ai-connections.v1.json','utf8'));
  const connection = stored.connections.find(c=>c.id===stored.selection?.connectionId);
  if (connection?.kind !== 'openrouter' || connection.authType !== 'api-key') throw Error('Expected selected OpenRouter API-key connection');
  const decrypted = await safeStorage.decryptStringAsync(Buffer.from(connection.encryptedSecret,'base64'));
  const secret = JSON.parse(decrypted.result);
  const model = stored.selection.modelId;
  async function generate(c, arm, evidence) {
    const messages = [{role:'system',content:system},{role:'user',content:`Analyze this ${c.bars}-measure score. ${c.focus}\n\n${c.abc}`}];
    if(evidence) messages.push({role:'user',content:'Additional read-only music21 evidence, computed from the exact same score revision. Do not accept chord roots blindly; interpret preparation/resolution and retain uncertainty.\n'+JSON.stringify(evidence)});
    const request={model,messages,temperature:0,max_tokens:4500,reasoning:{effort:'low'},provider:{allow_fallbacks:false}};
    await write(`${c.id}-${arm}-request.json`,request);
    const started=Date.now();
    const response=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${secret.apiKey}`,'Content-Type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.timeout(180000)});
    const body=await response.json();
    if(!response.ok || body.error) { await write(`${c.id}-${arm}-failure.json`,{status:response.status,error:body.error?.code ?? 'provider-error'}); throw Error(`Provider rejected ${arm}: HTTP ${response.status}`); }
    await write(`${c.id}-${arm}-response.json`,{latencyMs:Date.now()-started,body});
    await fs.writeFile(path.join(output,`${c.id}-${arm}.md`),body.choices?.[0]?.message?.content || '[No visible content returned]');
    if(body.choices?.[0]?.finish_reason!=='stop' || !body.choices?.[0]?.message?.content) throw Error(`Incomplete output for ${c.id}/${arm}`);
    console.log(JSON.stringify({case:c.id,arm,model:body.model,provider:body.provider,latencyMs:Date.now()-started,usage:body.usage}));
  }
  // Complete and persist every baseline before importing/running music21.
  for(const c of cases) await generate(c,'before');
  const {analyzeMusic21Python,prepareMusic21Input}=await import(path.join(root,'server/music21-python.mjs'));
  const evidenceBySize=[];
  for(const bars of [4,8,12,16,20]) {
    const abc=score(`Context size ${bars}`, [0,1,2,3].map(v=>long.slice(0,bars).map(c=>c[v]+'4')));
    const calls=[];
    for(let start=1;start<=bars;start+=16) {
      const end=Math.min(bars,start+15);
      const args={abcSource:abc,documentId:`context-${bars}`,revision:1,startMeasure:start,endMeasure:end,code};
      const result=await analyzeMusic21Python(args);
      calls.push({arguments:{startMeasure:start,endMeasure:end,code},result,rawInput:prepareMusic21Input(args)});
    }
    evidenceBySize.push({bars,abc,calls}); console.log(`Measured real music21: ${bars} bars`);
  }
  await write('context-payloads.json',evidenceBySize);
  for(const c of cases) {
    const calls=[];
    for(let start=1;start<=c.bars;start+=16) {
      calls.push(await analyzeMusic21Python({abcSource:c.abc,documentId:c.id,revision:1,startMeasure:start,endMeasure:Math.min(c.bars,start+15),code}));
    }
    await write(`${c.id}-evidence.json`,calls);
    await generate(c,'after',calls);
  }
  const manifest=[];
  for(const name of (await fs.readdir(output)).sort()) {
    if(name.endsWith('.json')||name.endsWith('.md')) manifest.push({name,sha256:crypto.createHash('sha256').update(await fs.readFile(path.join(output,name))).digest('hex')});
  }
  await write('run-manifest.json',{completedAt:new Date().toISOString(),model,liveProvider:true,credentialsLogged:false,files:manifest});
}
app.whenReady().then(main).then(()=>app.exit(0)).catch(e=>{ console.error(e.message);app.exit(1); });
