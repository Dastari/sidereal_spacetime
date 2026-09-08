"""Exercise the configured stdio MCP end to end, then close its owned process tree."""
import asyncio
import json
import sys
from datetime import timedelta
from pathlib import Path
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

ROOT = Path(__file__).resolve().parents[1]

async def main():
    parameters = StdioServerParameters(command='/usr/bin/python3', args=[str(ROOT/'scripts/dev.py'), 'mcp'], cwd=str(ROOT))
    with (ROOT/'.runtime/mcp-verification.log').open('w') as log:
        async with stdio_client(parameters, errlog=log) as (reader, writer):
            async with ClientSession(reader, writer, read_timeout_seconds=timedelta(seconds=50)) as session:
                await session.initialize()
                tools = await session.list_tools()
                assert any(tool.name == 'get_scene_info' for tool in tools.tools)
                result = await session.call_tool('get_scene_info', {'user_prompt': 'Verify Sidereal project Blender MCP scene access'})
                assert not result.isError, str(result)
                report = {'handshake': True, 'scene_query': True, 'tool_count': len(tools.tools)}
                (ROOT/'.runtime/mcp-results.json').write_text(json.dumps(report, indent=2)+'\n')
                print(json.dumps(report))

asyncio.run(main())
