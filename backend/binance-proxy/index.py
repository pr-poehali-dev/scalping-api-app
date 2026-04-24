import json
import urllib.request
import urllib.parse

def handler(event: dict, context) -> dict:
    """Прокси для Binance REST API — обходит CORS-ограничения браузера"""
    if event.get('httpMethod') == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Max-Age': '86400'
            },
            'body': ''
        }

    params = event.get('queryStringParameters') or {}
    endpoint = params.get('endpoint', '')

    ALLOWED = [
        '/api/v3/depth',
        '/api/v3/klines',
        '/api/v3/ticker/24hr',
        '/api/v3/ticker/price',
    ]

    if not any(endpoint.startswith(e) for e in ALLOWED):
        return {
            'statusCode': 400,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({'error': 'endpoint not allowed'})
        }

    # Build query without 'endpoint' param
    fwd = {k: v for k, v in params.items() if k != 'endpoint'}
    qs = urllib.parse.urlencode(fwd) if fwd else ''
    url = f'https://api.binance.com{endpoint}'
    if qs:
        url += '?' + qs

    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=10) as resp:
        body = resp.read().decode('utf-8')

    return {
        'statusCode': 200,
        'headers': {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json',
        },
        'body': body
    }
