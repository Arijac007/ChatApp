import asyncio
import ssl
import websockets

clients = set()

ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ssl_context.load_cert_chain('cert.pem', 'key.pem')  # Local copy of Let's Encrypt certs

async def handler(ws):
    clients.add(ws)
    try:
        async for message in ws:
            for client in clients:
                if client != ws:
                    await client.send(message)
    except:
        pass
    finally:
        clients.remove(ws)

async def main():
    async with websockets.serve(handler, "0.0.0.0", 8765, ssl=ssl_context):
        print("🔒 WSS signaling server running on port 8765")
        await asyncio.Future()

asyncio.run(main())
