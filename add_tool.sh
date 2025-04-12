#!/bin/bash

# 检查参数数量
if [ $# -ne 1 ]; then
    echo "Usage: $0 <module_name>"
    echo "Example: $0 calculator"
    exit 1
fi

module_name=$1


mkdir -p app/tools/$module_name

cat >> app/tools/$module_name/__init__.py << EOF
from flask import Blueprint
${module_name}_bp = Blueprint('$module_name', __name__,
                                 template_folder='templates',
                                 static_folder='static',
                                 static_url_path='static') 

from . import routes 
EOF

echo "Blueprint created in app/tools/$module_name/__init__.py"

touch app/tools/$module_name/routes.py
mkdir -p app/tools/$module_name/static/js/
touch app/tools/$module_name/static/js/script.js
mkdir -p app/tools/$module_name/static/css/
touch app/tools/$module_name/static/css/style.css

mkdir -p app/templates/$module_name
touch app/templates/$module_name/index.html

jq --arg module_name "$module_name" '. += [{"module_name": $module_name, "name": $module_name, "url": "/tools/\($module_name)", "description": ""}]' app/tools.json > temp.json && mv temp.json app/tools.json

echo "Tool added to app/tools.json. Please update details in app/tools.json."


template_content=$(cat app/templates/base.html)

# 创建临时文件
temp_file=$(mktemp)

# 先复制模板文件
cp docs/prompts/templates.md "$temp_file"

# 使用 perl 进行模块名替换，确保正确展开变量
perl -pi -e "s/\{\{module_name\}\}/${module_name}/g" "$temp_file"

# 对模板内容进行转义处理并替换
escaped_content=$(printf '%s\n' "$template_content" | perl -pe 's/[\$@\/\\]/\\$&/g')

# 使用 perl 替换base_template
perl -pi -e "s/\{\{base_template\}\}/${escaped_content}/g" "$temp_file"

# 移动到目标位置
mv "$temp_file" "docs/prompts/$module_name.md"

# 添加调试输出
echo "检查替换结果..."
grep -A 1 "module_name" "docs/prompts/$module_name.md"

echo "Prompt file generated at docs/prompts/$module_name.md"