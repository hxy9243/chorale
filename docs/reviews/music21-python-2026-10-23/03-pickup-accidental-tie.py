notes = list(score.parts[0].recurse().notes)
result = {"pitches": [n.nameWithOctave for n in notes], "writtenMeasures": [m["number"] for m in measures], "lastDuration": str(notes[-1].duration.quarterLength), "tieSourceCount": len(events[-1]["sourceEventIds"])}
