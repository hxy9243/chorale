# Wide guided harmony benchmark

Twenty frozen eight-measure passages: ten fresh DCML Mozart windows and ten previously unused pieces from the official BACHI validation partition. Every call used the same condition: model + music21 evidence + the analytical SKILL, with no few-shots and no BACHI predictions.

## Results

Primary label metrics below are duration-weighted. Boundary F1 is an equal-passage macro average.

| Corpus | Model | Effort | Exact key+Roman (95% bootstrap) | Local key | Root | Quality | Inversion | Boundary F1 | Valid calls | Mean latency |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| BACHI validation | gpt-5.6-luna | xhigh | 33.3% (18.0%--49.3%) | 71.5% | 62.4% | 67.3% | 63.2% | 69.7% | 10/10 | 654.2s |
| BACHI validation | gpt-5.6-sol | high | 33.2% (18.5%--47.3%) | 71.8% | 64.0% | 70.7% | 69.8% | 80.9% | 10/10 | 147.3s |
| BACHI validation | gpt-5.6-terra | xhigh | 31.5% (17.4%--46.4%) | 67.7% | 60.0% | 68.0% | 62.1% | 71.3% | 10/10 | 510.1s |
| BACHI validation | gpt-6-astra | medium | 38.0% (22.4%--54.0%) | 80.4% | 66.7% | 75.2% | 62.7% | 76.8% | 10/10 | 89.2s |
| DCML | gpt-5.6-luna | xhigh | 31.2% (16.8%--45.7%) | 62.5% | 71.6% | 62.7% | 57.1% | 57.9% | 10/10 | 712.1s |
| DCML | gpt-5.6-sol | high | 50.7% (35.0%--69.1%) | 72.0% | 81.9% | 73.1% | 79.0% | 85.3% | 10/10 | 147.2s |
| DCML | gpt-5.6-terra | xhigh | 30.6% (17.4%--45.2%) | 64.0% | 74.9% | 68.2% | 61.0% | 59.8% | 10/10 | 450.6s |
| DCML | gpt-6-astra | medium | 60.6% (47.3%--75.7%) | 80.0% | 85.5% | 80.0% | 82.4% | 82.7% | 10/10 | 76.3s |

## Findings

- **Astra medium is the clear DCML leader:** 60.6% exact, with a 47.3%--75.7% bootstrap interval.
- **BACHI is harder and less decisive:** Astra is still highest at 38.0%, but Luna (33.3%) and Sol (33.2%) are close and the intervals overlap heavily.
- **More reasoning is not monotonic:** Luna xhigh and Terra xhigh are both near 31% exact on DCML, well below Sol high and Astra medium.
- **The 85% product target is rarely met per passage:** Astra 2/20, Sol 2/20, Luna 0/20, Terra 0/20. No model reaches 85% in aggregate.
- **Latency strongly favors Astra:** mean per-call latency across both corpora is about 82.7s for Astra, 147.3s for Sol, 480.3s for Terra, and 683.2s for Luna.
- **Root identification is substantially easier than full functional analysis:** Astra reaches 85.5% root accuracy on DCML but only 60.6% exact local-key plus Roman agreement.
- **Boundary detection is not the same ranking:** Sol has the best boundary F1 on both corpora, despite trailing Astra on exact harmony.
- **Shared hard cases:** `wide-b03` (BACHI validation, best model 14.1%), `wide-b04` (BACHI validation, best model 12.5%), `wide-b07` (BACHI validation, best model 0.0%), `wide-b09` (BACHI validation, best model 10.9%), `wide-a09` (DCML, best model 0.0%).

## Interpretation boundary

- Compare models within each corpus. DCML and BACHI use different source repertoires and annotation conventions, so there is no pooled headline accuracy.
- These are ten passages per corpus, sufficient for a direction-finding comparison but not a product-readiness estimate. Case-level variance and failure modes matter more than small rank differences.
- BACHI is an official validation split, not a hidden test split. It is useful cross-corpus evidence, not a clean generalization claim.

## Frozen design

- Selection seed: `20260921`
- DCML: ten distinct movements, excluding the prior six held-out and two development movements.
- BACHI: official split seed 42; prior eight cross-reference pieces excluded; ten MusicXML-backed validation pieces selected before inference.
- Calls: 20 fresh passages x 4 model/effort pairs = 80.

## Coverage

| Case | Corpus | Source | Note events | Gold spans |
|---|---|---|---:|---:|
| wide-a01 | DCML | K279-3 | 93 | 14 |
| wide-a02 | DCML | K545-3 | 105 | 17 |
| wide-a03 | DCML | K545-2 | 151 | 17 |
| wide-a04 | DCML | K282-3 | 78 | 12 |
| wide-a05 | DCML | K282-2 | 91 | 16 |
| wide-a06 | DCML | K332-2 | 238 | 32 |
| wide-a07 | DCML | K281-3 | 106 | 14 |
| wide-a08 | DCML | K283-3 | 66 | 10 |
| wide-a09 | DCML | K280-3 | 53 | 8 |
| wide-a10 | DCML | K576-3 | 99 | 27 |
| wide-b01 | BACHI validation | schumann_liederkreis_op39n03 | 115 | 8 |
| wide-b02 | BACHI validation | Quartets_Haydn_Op20_No3_3 | 147 | 12 |
| wide-b03 | BACHI validation | Chamber_Other_Corelli_Op3No11_1 | 153 | 29 |
| wide-b04 | BACHI validation | schumann_liederkreis_op39n12 | 479 | 13 |
| wide-b05 | BACHI validation | Early_Choral_Bach_Chorales_353 | 126 | 30 |
| wide-b06 | BACHI validation | scarlatti_sonatas_K057 | 73 | 15 |
| wide-b07 | BACHI validation | scarlatti_sonatas_K050 | 67 | 12 |
| wide-b08 | BACHI validation | Keyboard_Other_Liszt_Années_de_pèlerinage_S162_2_Canzone | 284 | 11 |
| wide-b09 | BACHI validation | Variations_and_Grounds_Beethoven___WoO_77 | 154 | 15 |
| wide-b10 | BACHI validation | Early_Choral_Bach_Chorales_284 | 159 | 35 |
