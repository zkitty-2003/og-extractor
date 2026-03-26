import httpx
from bs4 import BeautifulSoup
import re
import json

def smart_extract(url):
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,th;q=0.8",
    }
    
    with httpx.Client(follow_redirects=True) as client:
        try:
            print(f"--- 🚀 Smart Extracting: {url} ---")
            resp = client.get(url, headers=headers, timeout=10)
            html = resp.text
            soup = BeautifulSoup(html, "html.parser")
            
            # 1. Standard Extraction
            og_tags = {}
            for tag in soup.find_all("meta"):
                prop = tag.get("property") or tag.get("name")
                content = tag.get("content")
                if prop and content:
                    if (prop.startswith("og:") or prop.startswith("twitter:")):
                        og_tags[prop] = content
            
            page_title = soup.title.string.strip() if soup.title else None
            
            # 2. YouTube Special Fallback
            if "youtube.com" in url or "youtu.be" in url:
                print("💡 Detecting YouTube... Applying Smart Fallback.")
                if not og_tags.get("og:title") or page_title == "- YouTube":
                    # Extract Video ID
                    video_id_match = re.search(r"v=([a-zA-Z0-9_-]+)", url)
                    if not video_id_match:
                        video_id_match = re.search(r"youtu\.be/([a-zA-Z0-9_-]+)", url)
                    
                    if video_id_match:
                        video_id = video_id_match.group(1)
                        print(f"  Found ID: {video_id}")
                        
                        # Fallback Title from raw Regex (look for title in JS/JSON)
                        if not og_tags.get("og:title") or og_tags.get("og:title") == "Visit source":
                            # Pattern 1: videoPrimaryInfoRenderer
                            title_match = re.search(r'"videoPrimaryInfoRenderer":.*?"title":.*?"text":"(.+?)"', html)
                            if not title_match:
                                # Pattern 2: simpleText title
                                title_match = re.search(r'"title":\{"simpleText":"(.+?)"\}', html)
                            if not title_match:
                                # Pattern 3: Generic runs
                                title_matches = re.finditer(r'"title":\{"runs":\[\{"text":"(.+?)"\}\]', html)
                                for tm in title_matches:
                                    t = tm.group(1)
                                    if t and t not in ["Visit source", "YouTube", ""]:
                                        og_tags["og:title"] = t
                                        break
                            
                            if title_match and not og_tags.get("og:title"):
                                og_tags["og:title"] = title_match.group(1)
                            
                            if og_tags.get("og:title"):
                                print(f"  ✅ Found Title in JS: {og_tags['og:title']}")
                                
                        # Fallback Thumbnail
                        if not og_tags.get("og:image"):
                            og_tags["og:image"] = f"https://i.ytimg.com/vi/{video_id}/maxresdefault.jpg"
                            print(f"  ✅ Built Thumbnail: {og_tags['og:image']}")

            if og_tags:
                print("\nFINAL RESULTS:")
                for k, v in og_tags.items():
                    print(f"  {k}: {v}")
            else:
                print("\n❌ No data found at all.")
                
        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    test_url = "https://www.youtube.com/watch?v=XfkzRNyygfk&list=RDXfkzRNyygfk&start_radio=1&pp=oAcB"
    smart_extract(test_url)
