"""Pure page-joining regressions; no model or network required."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
import xml.etree.ElementTree as ET

spec = importlib.util.spec_from_file_location('score_scan', Path(__file__).resolve().parents[1] / 'server/python/score_scan.py')
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)

XML = '''<score-partwise><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>{divisions}</divisions><key><fifths>{key}</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><staves>{staves}</staves></attributes><note><pitch><step>{pitch}</step><octave>4</octave></pitch><duration>{duration}</duration><voice>1</voice><staff>1</staff></note></measure></part></score-partwise>'''


class PageJoining(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name)
        self.paths = [self.folder / 'page2.musicxml', self.folder / 'page4.musicxml']
        self.output = self.folder / 'joined.musicxml'
        for index, path in enumerate(self.paths):
            path.write_text(XML.format(divisions=[6, 12][index], key=index, staves=2, pitch=['C', 'D'][index], duration=[2, 4][index]))

    def test_preserves_page_order_timing_units_keys_and_notes(self):
        ranges = adapter.merge_pages(self.paths, [2, 4], self.output)
        root = ET.parse(self.output).getroot()
        self.assertEqual([n.text for n in root.findall('.//pitch/step')], ['C', 'D'])
        self.assertEqual([n.text for n in root.findall('.//divisions')], ['6', '12'])
        self.assertEqual([n.text for n in root.findall('.//duration')], ['2', '4'])
        self.assertEqual([n.text for n in root.findall('.//fifths')], ['0', '1'])
        self.assertEqual([m.get('number') for m in root.findall('.//measure')], ['1', '2'])
        self.assertEqual(ranges, [{'page': 2, 'firstMeasure': 1, 'lastMeasure': 1}, {'page': 4, 'firstMeasure': 2, 'lastMeasure': 2}])

    def test_refuses_a_missing_selected_page(self):
        self.paths[1].unlink()
        with self.assertRaisesRegex(ValueError, 'Page 4'):
            adapter.merge_pages(self.paths, [2, 4], self.output)
        self.assertFalse(self.output.exists())

    def test_refuses_a_page_without_pitched_notes(self):
        self.paths[1].write_text('<score-partwise><part id="P1"/></score-partwise>')
        with self.assertRaisesRegex(ValueError, 'no pitched notes'):
            adapter.merge_pages(self.paths, [2, 4], self.output)

    def test_refuses_changed_staff_layout(self):
        self.paths[1].write_text(self.paths[1].read_text().replace('<staves>2</staves>', '<staves>1</staves>'))
        with self.assertRaisesRegex(ValueError, 'layout changed'):
            adapter.merge_pages(self.paths, [2, 4], self.output)

    def test_refuses_changed_part_identity(self):
        self.paths[1].write_text(self.paths[1].read_text().replace('id="P1"', 'id="P2"'))
        with self.assertRaisesRegex(ValueError, 'layout changed'):
            adapter.merge_pages(self.paths, [2, 4], self.output)

    def test_refuses_malformed_xml(self):
        self.paths[1].write_text('<broken')
        with self.assertRaises(ET.ParseError):
            adapter.merge_pages(self.paths, [2, 4], self.output)

    def test_refuses_missing_timing_units(self):
        self.paths[1].write_text(self.paths[1].read_text().replace('<divisions>12</divisions>', ''))
        with self.assertRaisesRegex(ValueError, 'timing units'):
            adapter.merge_pages(self.paths, [2, 4], self.output)

    def test_refuses_unequal_part_bar_counts(self):
        root = ET.parse(self.paths[1]).getroot()
        extra = ET.SubElement(root, 'part', id='P2')
        root.find('part-list').append(ET.fromstring('<score-part id="P2"><part-name>Extra</part-name></score-part>'))
        self.paths[1].write_bytes(ET.tostring(root))
        with self.assertRaisesRegex(ValueError, 'bar counts|timing units'):
            adapter.merge_pages(self.paths, [2, 4], self.output)


if __name__ == '__main__':
    unittest.main()
