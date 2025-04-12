You are an expert web developer. Please help develop a new tool for my tools gallery website.

** New Tool Description**
* 一款 JSON 格式化工具。
* 左右布局， 左侧编辑 JSON 源码， 右侧显示格式化后的结果。
* 右侧的格式化结果支持以下功能:
    - 节点可以折叠和展开。
    - 可以一键复制格式化的结果。
    - 基于源码实时更新格式化后的结果.


** Requirements **
* Javascript file name: `script.js`
* Style file name: `style.css`
* HTML file name: `index.html`:
    - `index.html` should extend `base.html`, which is a base template file.
    - use `url_for("{{module_name}}.static", "css/style.css")` to link `style.css`
    - use `url_for("{{module_name}}.static", "js/script.js")` to link `script.js`
* Server script: `routes.py`. use `from . import {{module_name}}_bp` to get blueprint. Then add route like this:
```python
@{{module_name}}_bp.route('/')
def index():
    return render_template('{{module_name}}/index.html')
```

** Resources **

base.html:
```html
{{base_template}}
```

Please generate code for the following files:
* `<tool_name>/index.html`
* `css/style.css`
* `js/script.js`
* `routes.py`
