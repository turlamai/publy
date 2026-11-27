import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {existsSync,mkdtempSync,mkdirSync,readFileSync,readdirSync,renameSync,rmSync} from "node:fs";
import os from "node:os";
import path from "node:path";

const formats={linux:"deb",darwin:"dmg",win32:"msi"};
const extension=formats[process.platform];
assert.ok(extension,"unsupported upgrade platform");

function findInstaller(directory,version){
 const names=readdirSync(directory).filter(name=>name.startsWith(`publy-desktop-${version}-`)&&name.endsWith("."+extension));
 assert.equal(names.length,1,"expected exactly one installer in "+directory);
 return path.resolve(directory,names[0]);
}
function run(command,args,{capture=false,env=process.env}={}){
 const result=spawnSync(command,args,{encoding:"utf8",stdio:capture?["ignore","pipe","inherit"]:"inherit",env});
 if(result.error)throw result.error;
 assert.equal(result.status,0,command+" failed");
 return result.stdout;
}
function checkBundle(executable,version){
 const result=run(executable,["--check-bundle"],{capture:true});
 assert.equal(result.trim(),`Publy ${version} bundle is ready`);
 console.log(result.trim());
}
function digest(file){return createHash("sha256").update(readFileSync(file)).digest("hex");}

const oldVersion="0.1.0";
const nextVersion=run("racket",["-e",'(require "packages/desktop/version.rkt")(display app-version)'],{capture:true}).trim();
const old=findInstaller("dist/desktop-baseline",oldVersion);
const next=findInstaller("dist/desktop-candidate",nextVersion);
assert.ok(path.basename(old).startsWith("publy-desktop-"+oldVersion+"-"));
assert.ok(nextVersion&&nextVersion!==oldVersion,"expected distinct versions");
assert.match(process.env.PUBLY_BASELINE_SHA256??"",/^[a-f0-9]{64}$/);
assert.equal(digest(old),process.env.PUBLY_BASELINE_SHA256,"old installer differs from accepted CI asset");
assert.equal(digest(next),readFileSync(next+".sha256","utf8").split(/\s/)[0]);

if(process.platform==="linux"){
 for(const [installer,version] of [[old,oldVersion],[next,nextVersion]]){
  run("sudo",["apt-get","install","-y",installer]);
  assert.equal(run("dpkg-query",["-W","-f=${Version}","publy"],{capture:true}),version);
  checkBundle("/usr/bin/Publy",version);
 }
}else if(process.platform==="win32"){
 const directory=mkdtempSync(path.join(os.tmpdir(),"publy-msi-"));
 const target=path.join(directory,"Publy");
 for(const [installer,version] of [[old,oldVersion],[next,nextVersion]]){
  run("pwsh",["-NoProfile","-NonInteractive","-Command",String.raw`
    $ErrorActionPreference='Stop'
    $arguments='/i "{0}" /qn /norestart INSTALLDIR="{1}" /l*v "{2}"' -f $env:PUBLY_TEST_MSI,$env:PUBLY_TEST_INSTALL,$env:PUBLY_TEST_LOG
    $process=Start-Process msiexec.exe -ArgumentList $arguments -Wait -PassThru
    if ($process.ExitCode -ne 0) { Get-Content $env:PUBLY_TEST_LOG -Tail 80; throw "MSI returned $($process.ExitCode)" }
    $versions=@(Get-ItemProperty 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' |
      Where-Object { $_.DisplayName -eq 'Publy' } | ForEach-Object { $_.DisplayVersion })
    if ($versions.Count -ne 1 -or $versions[0] -ne $env:PUBLY_TEST_VERSION) { throw "Unexpected installed Publy versions: $versions" }
  `],{env:{...process.env,PUBLY_TEST_MSI:installer,PUBLY_TEST_INSTALL:target,PUBLY_TEST_LOG:path.join(directory,version+".log"),PUBLY_TEST_VERSION:version}});
  checkBundle(path.join(target,"Publy.exe"),version);
 }
}else{
 const directory=mkdtempSync(path.join(os.tmpdir(),"publy-dmg-"));
 const mount=path.join(directory,"dmg");
 const installed=path.join(directory,"Publy.app");
 const incoming=path.join(directory,"incoming.app");
 const previous=path.join(directory,"previous.app");
 mkdirSync(mount);
 try{
  for(const [installer,version] of [[old,oldVersion],[next,nextVersion]]){
   run("hdiutil",["attach",installer,"-readonly","-nobrowse","-mountpoint",mount]);
   try{run("ditto",[path.join(mount,"Publy.app"),incoming]);}
   finally{run("hdiutil",["detach",mount]);}
   if(existsSync(installed))renameSync(installed,previous);
   renameSync(incoming,installed);
   run("codesign",["--verify","--deep","--strict",installed]);
   const info=path.join(installed,"Contents","Info.plist");
   assert.equal(run("/usr/libexec/PlistBuddy",["-c","Print :CFBundleIdentifier",info],{capture:true}).trim(),"io.glaze.Publy");
   checkBundle(path.join(installed,"Contents","MacOS","Publy"),version);
  }
 }finally{rmSync(directory,{recursive:true,force:true});}
}
console.log(`Installed upgrade passed: ${oldVersion} -> ${nextVersion} (${process.platform})`);
