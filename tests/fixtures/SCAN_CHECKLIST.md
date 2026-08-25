# Scan fixture checklist

Ground truth for the scan pipeline. Every question on the two fixture tests
tells you exactly what to mark, so each scanned page carries its own answer
key. Codes for the seeded tests and students are in `real-manifest.json`
(regenerate with `npm run seed:fixtures` after closing the app).

Put every file in `tests/fixtures/real/` (gitignored) using the exact file
names below. Keep whatever format the device produces (PDF, JPG, PNG); for
iPhone photos export JPG, not HEIC.

## 1. Print (from the app, section "Fixtures")

| Print run | Test | Students | Blank copies | Sheets you get |
|---|---|---|---|---|
| 1 | Fixture A: Clean marks | Selected: Test Alpha, Test Bravo | 1 | S1 (Alpha), S2 (Bravo), S3 (blank) |
| 2 | Fixture B: Edge cases | Selected: Test Alpha, Test Charlie | 0 | S4 (Alpha), S5 (Charlie) |

Label each sheet lightly in pencil in the bottom margin (S1 to S5) so they
do not get mixed up. Stay well away from the corner marks and the bubbles.

## 2. Fill

| Sheet | What to do |
|---|---|
| S1 | Fixture A, Alpha. Fill every row exactly as its question says, in **pencil**. |
| S2 | Fixture A, Bravo. Fill every row exactly as its question says, in **blue or black pen**. |
| S3 | Fixture A, blank sheet. Handwrite "Test Delta" in the Name box and "Fixtures" in the Section box, then fill every row as instructed, in pencil. |
| S4 | Fixture B, Alpha. Follow every row exactly, including the deliberate mistakes. Pencil unless the row says pen. |
| S5 | Fixture B, Charlie. Leave it completely untouched. No marks at all. |
| S6 | After S1 is filled in, photocopy it on the Canon. The copy is S6. |
| D | Any ordinary printed page that is not an answer sheet (a letter, a worksheet, a recipe). |

Fixture B rows, for reference:

1. Control: fill B darkly with pencil.
2. Leave blank.
3. Fill both A and C darkly.
4. Fill D darkly, then give B one light pencil stroke.
5. Fill E darkly, erase it completely, then fill A darkly.
6. Draw a check mark inside C instead of filling it.
7. Fill B darkly, then draw a stray pen line across the bubble row.
8. Fill C with a pen.
9. Fill A about half full.
10. Circle the letter A in the question text; no bubble.

## 3. Scan

Batch order for multi-page files is always S1, S2, S3, S4, S5, S6, D.

### ScanSnap (feeder)
| File name | How |
|---|---|
| `scansnap_batch_normal.pdf` | All seven pages in one run, in order, face up and right way round, default settings. |
| `scansnap_batch_upsidedown.pdf` | Same stack and order, but rotate S1 and S4 180 degrees before feeding. |
| `scansnap_batch_bw.pdf` | S1 and S4 only, scanner set to black and white (not gray or color), if it offers that mode. |
| `scansnap_single_s4.pdf` | S4 alone, default settings. |

### Canon flatbed
| File name | How |
|---|---|
| `canon-flatbed_s1_straight.pdf` | S1 squared against the guides, default settings. |
| `canon-flatbed_s4_askew.pdf` | S4 placed visibly crooked, about 5 degrees off. |
| `canon-flatbed_s2_pen.pdf` | S2 (pen), straight. |
| `canon-flatbed_s6_photocopy.pdf` | The photocopy S6, straight. |
| `canon-flatbed_s5_untouched.pdf` | S5 (untouched), straight. |

If the Canon software saves JPG or PNG instead of PDF, keep that extension.

### iPhone, Notes app (Scan Documents)
| File name | How |
|---|---|
| `iphone-notes_s1.pdf` | S1 on a table, let it auto-capture and auto-crop, save as PDF. |
| `iphone-notes_s4.pdf` | S4, same. |
| `iphone-notes_batch.pdf` | One scan session capturing S1, S2, S4 as three pages. |

### iPhone, Adobe Scan
| File name | How |
|---|---|
| `iphone-adobescan_s4.pdf` | S4 with Adobe's default enhancement on. |
| `iphone-adobescan_s1.pdf` | S1. |

### iPhone, plain Camera app (JPG)
| File name | How |
|---|---|
| `iphone-camera_s1_flat.jpg` | Phone flat directly above S1, good light, whole page in frame with some table visible around it. |
| `iphone-camera_s4_angle.jpg` | S4 from about 30 degrees off vertical, with your shadow across part of it. |
| `iphone-camera_s4_lowlight.jpg` | S4 in dim room light, no flash. |
| `iphone-camera_s3_blankname.jpg` | S3 (handwritten name) flat in good light. |

## 4. Expected results (what Phase 5 will assert)

- S1, S2, S3, S6 (Fixture A): every row equals its instruction, 10/10.
- S3 lands in "needs assignment" (no student in the QR) with the handwritten name visible.
- S4 rows follow the `accept` lists in `real-manifest.json`; the only hard failures are a *different* letter than instructed or a review flag missing on the blank and double-mark rows.
- S5 grades as ten blanks, all flagged.
- S6 duplicates S1 (same test and student) and must surface as a conflict, never a silent overwrite.
- D is bucketed "not a sheet".
- Upside-down pages, the askew flatbed scan, and the angled photo must align and grade the same as their straight counterparts.
