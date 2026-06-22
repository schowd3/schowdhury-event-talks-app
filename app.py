import time
import logging
import xml.etree.ElementTree as ET
import requests
from flask import Flask, render_template, jsonify, request

app = Flask(__name__)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"

# In-memory cache
cache = {
    "data": None,
    "last_fetched": 0
}
CACHE_TTL = 300 # 5 minutes

def parse_feed(xml_content):
    """
    Parses the BigQuery release notes Atom feed and returns a list of dictionaries.
    """
    try:
        root = ET.fromstring(xml_content)
        # Atom feed namespace
        ns = {'atom': 'http://www.w3.org/2005/Atom'}
        
        entries = []
        for entry in root.findall('atom:entry', ns):
            title_elem = entry.find('atom:title', ns)
            id_elem = entry.find('atom:id', ns)
            updated_elem = entry.find('atom:updated', ns)
            
            # Find the alternate link
            link = ""
            for l in entry.findall('atom:link', ns):
                if l.attrib.get('rel') == 'alternate' or not l.attrib.get('rel'):
                    link = l.attrib.get('href', '')
                    break
                    
            content_elem = entry.find('atom:content', ns)
            
            title = title_elem.text if title_elem is not None else ""
            id_val = id_elem.text if id_elem is not None else ""
            updated = updated_elem.text if updated_elem is not None else ""
            content_html = content_elem.text if content_elem is not None else ""
            
            entries.append({
                "id": id_val,
                "title": title, # Usually the date, e.g., "June 22, 2026"
                "updated": updated,
                "link": link,
                "content": content_html
            })
            
        return entries
    except Exception as e:
        logger.error(f"Error parsing XML feed: {e}")
        raise e

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/release-notes')
def get_release_notes():
    return fetch_release_notes()

def fetch_release_notes(force=False):
    current_time = time.time()
    if force or not cache["data"] or (current_time - cache["last_fetched"]) > CACHE_TTL:
        logger.info("Fetching fresh release notes from Google Cloud feed...")
        try:
            response = requests.get(FEED_URL, timeout=10)
            response.raise_for_status()
            
            parsed_entries = parse_feed(response.content)
            cache["data"] = parsed_entries
            cache["last_fetched"] = current_time
            logger.info(f"Successfully fetched and parsed {len(parsed_entries)} entries.")
        except Exception as e:
            logger.error(f"Failed to fetch release notes: {e}")
            if cache["data"]:
                logger.info("Serving stale cached data due to fetch failure.")
                return jsonify({
                    "entries": cache["data"],
                    "cached_at": cache["last_fetched"],
                    "error_warning": "Could not refresh feed. Displaying cached data."
                })
            return jsonify({"error": "Failed to fetch release notes", "details": str(e)}), 500
            
    return jsonify({
        "entries": cache["data"],
        "cached_at": cache["last_fetched"]
    })

@app.route('/api/release-notes/refresh', methods=['POST'])
def refresh_release_notes():
    return fetch_release_notes(force=True)

if __name__ == '__main__':
    app.run(debug=True, port=5001)
