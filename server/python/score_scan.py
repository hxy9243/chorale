"""Local Copisteria adapter. Inputs and all artifacts belong to one Chorale job."""
import argparse
import copy
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import xml.etree.ElementTree as ET

MAX_XML = 8 * 1024 * 1024


def merge_pages(paths, pages, output):
    """Join page outputs without repairing music or discarding failed pages."""
    roots = []
    topology = None
    page_ranges = []
    offset = 0
    for path, page in zip(paths, pages, strict=True):
        if not path.is_file() or path.stat().st_size > MAX_XML:
            raise ValueError(f'Page {page}: missing or oversized MusicXML; no pages were imported.')
        content = path.read_text(encoding='utf-8')
        if '<!ENTITY' in content.upper():
            raise ValueError('Entity declarations are not supported in scan output.')
        root = ET.fromstring(content)
        parts = root.findall('part')
        if root.tag != 'score-partwise' or not parts or root.find('.//pitch') is None:
            raise ValueError(f'Page {page}: no pitched notes were recognized; no pages were imported.')
        if root.find('.//time/beats') is None or root.find('.//time/beat-type') is None:
            raise ValueError(f'Page {page}: no time signature was recognized; scan pages separately.')
        layout = []
        counts = []
        for part in parts:
            measures = part.findall('measure')
            counts.append(len(measures))
            # Every independent page must establish its own timing units.
            divisions = part.find('measure/attributes/divisions')
            if divisions is None or int(divisions.text or '0') <= 0:
                raise ValueError(f'Page {page}: missing timing units; scan pages separately.')
            staves = max([int(node.text or '1') for node in part.findall('.//staves')] +
                         [int(node.text or '1') for node in part.findall('.//note/staff')] + [1])
            layout.append((part.get('id'), staves))
        if not counts[0] or len(set(counts)) != 1:
            raise ValueError(f'Page {page}: parts have different bar counts; scan pages separately.')
        if topology is not None and layout != topology:
            raise ValueError(f'Page {page}: part or staff layout changed; scan pages separately.')
        topology = layout
        page_ranges.append({'page': page, 'firstMeasure': offset + 1, 'lastMeasure': offset + counts[0]})
        offset += counts[0]
        roots.append(root)
    if not roots:
        raise ValueError('No selected pages were recognized.')
    joined = copy.deepcopy(roots[0])
    for root in roots[1:]:
        for target, part in zip(joined.findall('part'), root.findall('part'), strict=True):
            for measure in part.findall('measure'):
                target.append(copy.deepcopy(measure))
    for part in joined.findall('part'):
        for number, measure in enumerate(part.findall('measure'), 1):
            measure.set('number', str(number))
    payload = ET.tostring(joined, encoding='utf-8', xml_declaration=True)
    if len(payload) > MAX_XML:
        raise ValueError('Recognition output is too large. Choose fewer pages.')
    output.write_bytes(payload)
    return page_ranges


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--home', required=True)
    parser.add_argument('--folder', required=True)
    parser.add_argument('--source', required=True)
    parser.add_argument('--pages', required=True)
    args = parser.parse_args()
    home, folder, source = (Path(value).resolve() for value in (args.home, args.folder, args.source))
    if sys.platform.startswith('linux'):
        import resource
        resource.setrlimit(resource.RLIMIT_AS, (8 * 1024 ** 3, 8 * 1024 ** 3))
    pages = json.loads(args.pages)
    if not isinstance(pages, list) or not 1 <= len(pages) <= 60 or any(type(p) is not int or not 1 <= p <= 10000 for p in pages):
        raise ValueError('Choose up to 60 valid pages.')
    # The installed model operates offline; explicit CPU/thread settings avoid
    # changing inference behavior with a user's accelerator or thread count.
    os.environ['COPISTERIA_DETECTOR'] = '28m'
    import torch
    torch.set_num_threads(4)
    from PIL import Image
    Image.MAX_IMAGE_PIXELS = 40_000_000
    inputs, raw = folder / 'pages', folder / 'copisteria'
    inputs.mkdir()
    raw.mkdir()
    pngs = []
    for page in pages:
        png = inputs / f'page-{page:06d}.png'
        if source.suffix == '.pdf':
            # Scale bounds each raster to at most 3300 x 3300 pixels.
            subprocess.run(['pdftoppm', '-f', str(page), '-l', str(page), '-r', '220',
                            '-scale-to', '3300', '-singlefile', '-png', str(source), str(png.with_suffix(''))],
                           check=True, timeout=60)
        else:
            shutil.copyfile(source, png)
        with Image.open(png) as image:
            if image.width * image.height > 40_000_000:
                raise ValueError(f'Page {page} exceeds the image size limit.')
            image.verify()
        pngs.append(png)
    os.chdir(home)
    from copisteria.pipeline import main as recognize
    recognize([*[str(png) for png in pngs], '--out', str(raw), '--device', 'cpu', '--detector', '28m'])
    ranges = merge_pages([raw / f'{png.stem}.musicxml' for png in pngs], pages, folder / 'recognized.musicxml')
    (folder / 'copisteria.json').write_text(json.dumps({'pageMeasures': ranges}, indent=2))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        if isinstance(error, (ImportError, ModuleNotFoundError)):
            message = 'Copisteria installation is incomplete. Run scanner setup again.'
        elif isinstance(error, FileNotFoundError) and error.filename == 'pdftoppm':
            message = 'PDF recognition requires Poppler (pdftoppm). Install it and try again.'
        elif isinstance(error, MemoryError):
            message = 'Recognition exceeded its memory limit. Try one page or a smaller image.'
        else:
            message = str(error)
        print(f'ERROR {message}', file=sys.stderr, flush=True)
        sys.exit(1)
