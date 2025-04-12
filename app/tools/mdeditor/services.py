import json
from datetime import datetime

class StorageService:
    @staticmethod
    def generate_id():
        """Generate a unique document ID based on timestamp"""
        return f"doc_{int(datetime.now().timestamp()*1000)}"

    @staticmethod
    def format_doc(doc_id, title, content):
        """Format document data for storage/response"""
        return {
            "id": doc_id,
            "title": title or "Untitled",
            "content": content or "",
            "updated_at": datetime.now().isoformat()
        }

