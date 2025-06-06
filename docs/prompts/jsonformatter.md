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
    - use `url_for("jsonformatter.static", "css/style.css")` to link `style.css`
    - use `url_for("jsonformatter.static", "js/script.js")` to link `script.js`
* Server script: `routes.py`. use `from . import jsonformatter_bp` to get blueprint. Then add route like this:
```python
@jsonformatter_bp.route('/')
def index():
    return render_template('jsonformatter/index.html')
```

** Resources **

base.html:
```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/VT323/1.0/VT323-Regular.css" rel="stylesheet">
    <title>{{ page_title | default('氛围工具店') }}</title>
    <style>
        /* Apply Inter font globally if loaded */
        body {
            font-family: 'Inter', sans-serif;
        }
        /* Ensure main content area takes available height */
        .main-content {
            min-height: calc(100vh - 8rem); /* Adjust based on header/footer height */
        }
        
        /* 走马灯广告样式 */
        .marquee-container {
            height: 30px;
            /* background-color: #333; */
            position: relative;
            overflow: hidden;
            /* border: 2px solid #444; */
            /* box-shadow: 0 0 5px rgba(0, 0, 0, 0.5) inset; */
            image-rendering: pixelated;
            border-radius: 4px;
            flex-grow: 1;
            margin: 0 1rem;
        }

        .marquee-text {
            position: absolute;
            white-space: nowrap;
            font-size: 18px;
            font-weight: bold;
            font-family: 'VT323', monospace;
            letter-spacing: 1px;
            line-height: 30px;
            background-image: linear-gradient(to right, 
                #FF0000, #FF7F00, #FFFF00, #00FF00, 
                #0000FF, #4B0082, #9400D3, #FF0000);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            background-size: 600px 100%;
            text-shadow: 1px 1px 0 rgba(0, 0, 0, 0.5);
            will-change: transform;
        }

        /* 像素背景效果 */
        .pixel-overlay {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-image: url("data:image/svg+xml,%3Csvg width='2' height='2' xmlns='http://www.w3.org/2000/svg'%3E%3Crect x='0' y='0' width='1' height='1' fill='rgba(0,0,0,0.1)'/%3E%3C/svg%3E");
            background-size: 2px 2px;
            pointer-events: none;
            opacity: 0.8;
        }
    </style>
</head>
<body class="bg-gray-50 text-gray-800 antialiased">

    <header class="bg-white shadow-sm sticky top-0 z-10">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex justify-between items-center h-16">
                <div class="flex-shrink-0 flex items-center">
                    {% block header_left %}
                    <a href="{{ url_for("main.index") }}" class="flex items-center">
                        <span class="text-xl font-semibold text-gray-700">{{ header_title | default('氛围工具店') }}</span>
                    </a>
                    {% endblock %}
                    {% block subheader_left %}
                    {% endblock %}
                </div>
                
                <!-- 走马灯广告 -->
                <div class="marquee-container">
                    <div id="marquee" class="marquee-text">欢迎光临氛围工具店！本店所有工具均非手工打造，请放心使用！</div>
                    <div class="pixel-overlay"></div>
                </div>

                <div class="hidden md:block">
                    {% block header_right %}
                    {% endblock %}
                </div>
            </div>
        </div>
    </header>

    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 main-content">
        {% block content %}
        <div class="bg-white p-6 rounded-lg shadow">
            <h2 class="text-2xl font-semibold mb-4">{{ content_title | default('内容区域') }}</h2>
            <div>
                {{ main_content | safe | default('这里是放置小工具主要内容的地方。') }}
            </div>
        </div>
        {% endblock %}
    </main>

    <footer class="bg-gray-100 border-t border-gray-200 mt-auto">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 text-center text-gray-500 text-sm">
            {% block footer %}
            <!-- {{ footer_text | default('&copy; ' + "2025" + ' 版权所有。') }} -->
            &copy; 2025 氛围工具店 版权所有
            {% endblock %}
        </div>
    </footer>

    <script>
        // 走马灯广告脚本
        const marquee = document.getElementById('marquee');
        let startPos = document.querySelector('.marquee-container').offsetWidth;
        let animationId;
        let speed = 1.5;

        // 设置初始位置
        marquee.style.transform = `translateX(${startPos}px)`;

        function animate() {
            startPos -= speed;
            // 当文字完全移出屏幕左侧，重置位置到右侧
            if (startPos < -marquee.offsetWidth) {
                startPos = document.querySelector('.marquee-container').offsetWidth;
            }
            marquee.style.transform = `translateX(${startPos}px)`;
            animationId = requestAnimationFrame(animate);
        }

        // 开始动画
        animate();

        // 响应窗口大小变化
        window.addEventListener('resize', function() {
            const containerWidth = document.querySelector('.marquee-container').offsetWidth;
            if (startPos < 0 && startPos > -marquee.offsetWidth) {
                // 保持相对位置
            } else {
                startPos = containerWidth;
            }
        });

        // 点击切换消息
        document.querySelector('.marquee-container').addEventListener('click', function() {
            const messages = [
                "欢迎光临氛围工具店！",
                "本店所有工具均非手工打造，欢迎使用！",
            ];
            const currentMsg = marquee.textContent;
            let newMsg;
            do {
                newMsg = messages[Math.floor(Math.random() * messages.length)];
            } while (newMsg === currentMsg);
            
            marquee.textContent = newMsg;
        });
    </script>
</body>
</html>

```

Please generate code for the following files:
* `<tool_name>/index.html`
* `css/style.css`
* `js/script.js`
* `routes.py`
