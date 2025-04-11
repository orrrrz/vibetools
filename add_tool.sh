#!/bin/bash

# 检查参数数量
if [ $# -ne 1 ]; then
    echo "Usage: $0 <module_name>"
    echo "Example: $0 calculator"
    exit 1
fi

module_name=$1


mkdir app/tools/$module_name

cat >> app/tools/$module_name/__init__.py << EOF
from flask import Blueprint
${module_name}_bp = Blueprint('$module_name', __name__,
                                 template_folder='templates',
                                 static_folder='static',
                                 static_url_path='static') 

from . import routes 
EOF

touch app/tools/$module_name/routes.py

mkdir app/templates/$module_name

jq --argjson new_object '{
    "module_name": "$module_name",
    "name": "$module_name",
    "url": "/tools/$module_name",
    "description": ""
}' '. += [$new_object]' app/tools.json > temp.json && mv temp.json app/tools.json

echo "Please update tool info in app/tools.json manually"