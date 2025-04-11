import os

basedir = os.path.abspath(os.path.dirname(__file__))

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'a_very_secret_string'
    # 其他通用配置...
    @staticmethod
    def init_app(app):
        pass

class DevelopmentConfig(Config):
    DEBUG = True
    # 开发环境特定配置...

class ProductionConfig(Config):
    DEBUG = False
    # 生产环境特定配置...
    # 例如: 配置日志、不同的数据库等

class TestingConfig(Config):
    TESTING = True
    WTF_CSRF_ENABLED = False # 通常在测试中禁用 CSRF
    # 测试环境特定配置...

config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig,
    'default': DevelopmentConfig
}