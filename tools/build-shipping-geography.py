"""Build local US postal/place lookup shards from Census Gazetteer files.

Public geographic reference data only. No customer addresses or API keys.
The tracking map requests only the small region shards it needs.
"""
import csv
import io
import json
import pathlib
import re
import unicodedata
import urllib.request
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
DEST = ROOT / "src/account/geography"
YEAR = "2026"
BASE = f"https://www2.census.gov/geo/docs/maps-data/data/gazetteer/{YEAR}_Gazetteer/"


def rows(kind):
    url = BASE + f"{YEAR}_Gaz_{kind}_national.zip"
    request = urllib.request.Request(url, headers={"User-Agent": "PragOptics geography build; support@bridgesindust.com"})
    with urllib.request.urlopen(request, timeout=25) as response:
        raw = response.read()
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        name = next(n for n in archive.namelist() if n.endswith(".txt"))
        text = archive.read(name).decode("utf-8-sig")
    delimiter = "|" if "|" in text.splitlines()[0] else "\t"
    return [{k.strip(): v.strip() for k, v in row.items()} for row in csv.DictReader(io.StringIO(text), delimiter=delimiter)], url


def slug(value):
    return re.sub(r"[^a-z0-9]", "", unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode().lower())


def write(folder, groups):
    for key, data in groups.items():
        target = DEST / folder / (key + ".json")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(data, separators=(",", ":"), sort_keys=True), encoding="utf-8")


postal, postal_source = rows("zcta")
zips = {}
for row in postal:
    code = row["GEOID"]
    zips.setdefault(code[:2], {})[code] = [round(float(row["INTPTLAT"]), 4), round(float(row["INTPTLONG"]), 4)]
write("us-zips", zips)

places, place_source = rows("place")
cities = {}
for row in places:
    name = re.sub(r" (city|town|village|borough|CDP|municipality|comunidad|zona urbana)( \(balance\))?$", "", row["NAME"], flags=re.I)
    key = slug(name)
    target = cities.setdefault(row["USPS"].lower(), {})
    coordinate = [round(float(row["INTPTLAT"]), 4), round(float(row["INTPTLONG"]), 4)]
    # Do not pick an arbitrary location when the same state has duplicate names.
    target[key] = coordinate if key not in target or target[key] == coordinate else None
write("us-cities", cities)
metadata = {"source": "U.S. Census Bureau Gazetteer", "year": YEAR, "postalSource": postal_source, "placeSource": place_source, "postalAreas": len(postal), "places": len(places), "precision": "Representative area points; not street, facility, or package GPS positions"}
(DEST / "source.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"postalAreas": len(postal), "places": len(places), "shards": len(zips) + len(cities)}))
