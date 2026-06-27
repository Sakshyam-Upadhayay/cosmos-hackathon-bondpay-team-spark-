import os

def build_webui():
    dir_path = os.path.dirname(os.path.abspath(__file__))
    data_dir = os.path.join(dir_path, "data")
    
    html_path = os.path.join(data_dir, "index.html")
    css_path = os.path.join(data_dir, "styles.css")
    js_path = os.path.join(data_dir, "app.js")
    output_path = os.path.join(dir_path, "WebUI.h")
    
    if not os.path.exists(html_path) or not os.path.exists(css_path) or not os.path.exists(js_path):
        print("Error: Missing index.html, styles.css, or app.js in data/ directory")
        return
        
    with open(html_path, "r", encoding="utf-8") as f:
        html_content = f.read()
        
    with open(css_path, "r", encoding="utf-8") as f:
        css_content = f.read()
        
    with open(js_path, "r", encoding="utf-8") as f:
        js_content = f.read()
        
    # Replace CSS reference
    css_placeholder = '<link rel="stylesheet" href="styles.css">'
    css_replacement = f"<style>\n{css_content}\n</style>"
    if css_placeholder in html_content:
        html_content = html_content.replace(css_placeholder, css_replacement)
    else:
        print("Warning: CSS placeholder link not found in index.html, inserting in <head>")
        html_content = html_content.replace("</head>", f"{css_replacement}\n</head>")
        
    # Replace JS reference
    js_placeholder = '<script src="app.js"></script>'
    # Avoid escaping issue in Raw String literal if it contains )rawliteral. There is no rawliteral in js_content.
    js_replacement = f"<script>\n{js_content}\n</script>"
    if js_placeholder in html_content:
        html_content = html_content.replace(js_placeholder, js_replacement)
    else:
        print("Warning: JS placeholder script not found in index.html, inserting before </body>")
        html_content = html_content.replace("</body>", f"{js_replacement}\n</body>")
        
    # Write to WebUI.h
    header_content = f"""#ifndef WEBUI_H
#define WEBUI_H

const char index_html[] PROGMEM = R"rawliteral(
{html_content}
)rawliteral";

#endif
"""
    
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(header_content)
        
    print(f"Successfully generated {output_path}")

if __name__ == "__main__":
    build_webui()
