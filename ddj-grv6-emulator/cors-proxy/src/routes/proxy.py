from flask import Blueprint, request, Response, jsonify
import requests
from urllib.parse import urlparse
import mimetypes

proxy_bp = Blueprint('proxy', __name__)

@proxy_bp.route('/audio', methods=['GET'])
def proxy_audio():
    """
    Proxy endpoint para contornar restrições CORS ao carregar arquivos de áudio
    """
    try:
        # Obter a URL do parâmetro de query
        url = request.args.get('url')
        
        if not url:
            return jsonify({'error': 'URL parameter is required'}), 400
        
        # Validar se é uma URL válida
        parsed_url = urlparse(url)
        if not parsed_url.scheme or not parsed_url.netloc:
            return jsonify({'error': 'Invalid URL format'}), 400
        
        # Verificar se é um arquivo de áudio baseado na extensão
        audio_extensions = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac']
        if not any(url.lower().endswith(ext) for ext in audio_extensions):
            return jsonify({'error': 'URL must point to an audio file'}), 400
        
        # Fazer a requisição para o servidor externo
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'audio/*,*/*;q=0.9',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'identity',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
        }
        
        response = requests.get(url, headers=headers, stream=True, timeout=30)
        response.raise_for_status()
        
        # Determinar o tipo de conteúdo
        content_type = response.headers.get('content-type')
        if not content_type:
            # Tentar determinar pelo nome do arquivo
            content_type, _ = mimetypes.guess_type(url)
            if not content_type:
                content_type = 'audio/mpeg'  # Default para MP3
        
        # Criar resposta com headers CORS apropriados
        def generate():
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    yield chunk
        
        proxy_response = Response(
            generate(),
            status=response.status_code,
            headers={
                'Content-Type': content_type,
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Range',
                'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
                'Accept-Ranges': 'bytes',
                'Cache-Control': 'public, max-age=3600',
            }
        )
        
        # Adicionar Content-Length se disponível
        content_length = response.headers.get('content-length')
        if content_length:
            proxy_response.headers['Content-Length'] = content_length
        
        return proxy_response
        
    except requests.exceptions.RequestException as e:
        return jsonify({'error': f'Failed to fetch audio: {str(e)}'}), 502
    except Exception as e:
        return jsonify({'error': f'Internal server error: {str(e)}'}), 500

@proxy_bp.route('/audio', methods=['OPTIONS'])
def proxy_audio_options():
    """
    Handle preflight OPTIONS requests for CORS
    """
    return Response(
        status=200,
        headers={
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Range',
            'Access-Control-Max-Age': '86400',
        }
    )

@proxy_bp.route('/test', methods=['GET'])
def test_proxy():
    """
    Endpoint de teste para verificar se o proxy está funcionando
    """
    return jsonify({
        'status': 'ok',
        'message': 'CORS Proxy is running',
        'usage': 'GET /api/proxy/audio?url=<audio_url>'
    })

