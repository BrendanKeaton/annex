import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv(".env")

SUPABASE_URL = os.environ.get("SUPABASE_URL")
# This is actually the new supabase secret key, but use service key as name because that is what I am familiar with
SERVICE_KEY = os.environ.get("SUPABASE_KEY")

if not SUPABASE_URL:
    raise RuntimeError("ERR: SUPABASE URL NOT FOUND IN ENV VARIABLES")
if not SERVICE_KEY:
    raise RuntimeError("ERR: SUPABASE SERVICE KEY NOT FOUND IN ENV VARIABLES")

supabase_service_client: Client = create_client(SUPABASE_URL, SERVICE_KEY)
supabase_auth_client: Client = create_client(SUPABASE_URL, SERVICE_KEY)
