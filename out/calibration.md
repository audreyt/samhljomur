# Calibration — Clef `category` vs Samtal hand coding

Gögn: Samtal, félag til almannaheilla (talasaman.is), CC BY 4.0

- Unit: 128 unique Íslenskast answers
- Hit = Clef argmax ∈ truth category set
- Overall hit rate: **82.0%** (105/128)
- Cohen's κ on single-category answers (n=100, 8 classes): **0.739** (po=0.780, pe=0.156)
- Mean Clef confidence: hits 0.500 (n=105) vs misses 0.219 (n=23)

## Per-category hit rate

| truth category | n | hits | hit rate |
|---|---:|---:|---:|
| matur | 37 | 26 | 70.3% |
| nattura | 30 | 30 | 100.0% |
| samfelag | 29 | 23 | 79.3% |
| sidir | 21 | 18 | 85.7% |
| hugarfar | 14 | 12 | 85.7% |
| tunga | 17 | 17 | 100.0% |
| vedur | 7 | 6 | 85.7% |
| annad | 2 | 1 | 50.0% |

## Confusion matrix (single-category answers; rows = truth, cols = pred)

| truth \ pred | matur | nattura | samfelag | sidir | hugarfar | tunga | vedur | annad |
|---|---|---|---|---|---|---|---|---|
| **matur** | 15 | 5 | 0 | 2 | 0 | 2 | 1 | 0 |
| **nattura** | 0 | 19 | 0 | 0 | 0 | 0 | 0 | 0 |
| **samfelag** | 0 | 1 | 13 | 0 | 0 | 2 | 0 | 2 |
| **sidir** | 0 | 0 | 0 | 9 | 0 | 1 | 0 | 2 |
| **hugarfar** | 0 | 1 | 0 | 0 | 6 | 1 | 0 | 0 |
| **tunga** | 0 | 0 | 0 | 0 | 0 | 12 | 0 | 0 |
| **vedur** | 0 | 1 | 0 | 0 | 0 | 0 | 3 | 0 |
| **annad** | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 1 |

## Misses (23)

| answer | truth | pred | confidence |
|---|---|---|---:|
| slátur | matur | tunga | 0.063 |
| Hrútspungar | matur | nattura | 0.114 |
| Hákarl | matur | nattura | 0.536 |
| Sviðakjammi | matur | tunga | 0.072 |
| Þorrablót | matur | sidir | 0.251 |
| Þorramatur og þjóðhátíðardagurinn | matur+samfelag | sidir | 0.293 |
| Harðfiskur | matur | nattura | 0.182 |
| Ís að vetri | matur | vedur | 0.427 |
| Ís í fárviðri | matur | nattura | 0.225 |
| Ísbíltúrar á veturna | matur | nattura | 0.190 |
| Prins póló | matur | sidir | 0.086 |
| Ættjarðarást | samfelag | tunga | 0.114 |
| Hjörð | samfelag | nattura | 0.144 |
| Þessi rödd sem við höfum, skoðanapistlar, okkur finnst við geta lagt að mörkum í umræðu um landsmál | samfelag | tunga | 0.665 |
| Dýrt en fallegt | samfelag | annad | 0.225 |
| tuðandi hamingjusöm | samfelag | annad | 0.160 |
| ularpeisa | sidir | annad | 0.082 |
| Hefðir | sidir | tunga | 0.161 |
| Facebook og AirForce skór | sidir | annad | 0.212 |
| Dugur | hugarfar | nattura | 0.118 |
| Seigla | hugarfar | tunga | 0.115 |
| Lykt af grænu grasi á sumrin og kaldar rauðar kynnar eftir að inn er komið að vetri | vedur | nattura | 0.379 |
| Grasystingur | annad | nattura | 0.223 |
