from flask import render_template, request, jsonify
from . import simple_calculator_bp # 导入蓝图实例
from .logic import perform_calculation # 导入后端逻辑

@simple_calculator_bp.route('/')
def index():
    # 渲染工具的主页面
    return render_template('simple_calculator/index.html')

@simple_calculator_bp.route('/calculate', methods=['POST'])
def calculate_api():
    data = request.get_json()
    if not data or 'num1' not in data or 'num2' not in data or 'operation' not in data:
        return jsonify({'error': 'Missing data'}), 400

    try:
        result = perform_calculation(data['num1'], data['num2'], data['operation'])
        return jsonify({'result': result})
    except Exception as e:
        return jsonify({'error': str(e)}), 400