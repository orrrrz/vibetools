
## 如何运行

```
python run.py
```

然后可通过 `http://127.0.0.1:8080` 访问。 


## 如何添加新工具?

新工具初始化:
```
./add_tool.sh <module_name>
```
如:
```
./add_tool.sh calculator
```

该命令会生成 Prompt 文件 `/docs/prompts/<module_name>`。 请在该文件中更新工具提示词， 然后通过 Gemini/Claude 等模型完成工具代码编写。 

代码编写完成后， 更新以下文件:

* `app/templates/<module_name>/index.html`
* `app/tools/<module_name>/routes.py`
* `app/tools/<module_name>/static/js/script.js`
* `app/tools/<module_name>/static/css/style.css`

然后重启服务器， 注意观察日志工具是否加载成功。 如出现以下提示表示加载成功:
```
Successfully registered blueprint for tool 'JSON 格式化' from app.tools.jsonformatter with prefix '/tools/jsonformatter'.
```