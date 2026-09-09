import ts from 'typescript';
import {readFileSync} from 'node:fs';
const overrides:Record<string,string>=JSON.parse(readFileSync('.runtime/pose-shared-preview.json','utf8'));
const configFile=ts.readConfigFile('tsconfig.json',ts.sys.readFile),config=ts.parseJsonConfigFileContent(configFile.config,ts.sys,'.');
const host=ts.createCompilerHost(config.options),read=host.readFile.bind(host);host.readFile=name=>overrides[name]??read(name);
const program=ts.createProgram(config.fileNames,config.options,host),diagnostics=ts.getPreEmitDiagnostics(program);
if(diagnostics.length){console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:f=>f,getCurrentDirectory:ts.sys.getCurrentDirectory,getNewLine:()=>"\n"}));process.exitCode=1;}else console.log('Shared patch typechecks in memory; parent files untouched.');
