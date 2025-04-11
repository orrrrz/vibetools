import os
from app import create_app

# 根据环境变量选择配置，默认为 'development'
config_name = os.getenv('FLASK_CONFIG', 'development')
app = create_app(config_name)

if __name__ == '__main__':
    # host='0.0.0.0' 允许外部访问
    app.run(host='0.0.0.0', port=8000)