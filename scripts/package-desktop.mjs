import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {copyFileSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,rmSync,writeFileSync} from "node:fs";
import path from "node:path";

const platforms={
 darwin:{id:"macos",arch:"arm64",suffix:".dmg"},
 win32:{id:"windows",arch:"x64",suffix:".msi"},
 linux:{id:"linux",arch:"x64",suffix:".deb"}
};
const flags=process.argv.slice(2);
const release=flags.length===1&&flags[0]==="--release";
if(flags.length&&!release)throw Error("Usage: node scripts/package-desktop.mjs [--release]");
const platform=platforms[process.platform];
if(!platform||platform.arch!==process.arch)throw Error("Unsupported desktop candidate target");

function run(command,args,options={}){
 const result=spawnSync(command,args,{encoding:"utf8",stdio:"inherit",...options});
 if(result.error)throw result.error;
 if(result.status!==0)throw Error(command+" failed");
 return result.stdout;
}
const version=run("racket",["-e",'(require "packages/desktop/version.rkt")(display app-version)'],
                  {stdio:["ignore","pipe","inherit"]}).trim();
if(!/^\d+\.\d+\.\d+$/.test(version))throw Error("Invalid desktop version");
const signArgs=[];
if(release){
 run("racket",["-e",`(require glaze/signing "packages/desktop/update-trust.rkt")
   (unless (and (string? update-public-key-pem) (string? update-key-id)
                (regexp-match? #rx"BEGIN PUBLIC KEY" update-public-key-pem)
                (regexp-match? #px"^[A-Za-z0-9_-]+$" update-key-id))
     (error 'release "Configure the embedded update verification key and ID first"))
   (void (call-with-embedded-update-key public-key-fingerprint))`]);
 if(process.platform==="darwin"){
  const identity=process.env.PUBLY_MAC_SIGN_IDENTITY??"";
  if(!identity.startsWith("Developer ID Application:")||!process.env.PUBLY_MAC_NOTARY_PROFILE)
   throw Error("Developer ID Application identity and an Apple notary keychain profile are required");
  signArgs.push("--sign",identity);
 }else if(process.platform==="win32"){
  const thumbprint=process.env.PUBLY_WINDOWS_CERT_THUMBPRINT??"";
  if(!/^[0-9a-f]{40}$/i.test(thumbprint))throw Error("A Windows Authenticode certificate thumbprint is required");
  signArgs.push("--sign",thumbprint);
 }
}else if(process.platform==="darwin"){
 signArgs.push("--sign","-");
}

mkdirSync("dist",{recursive:true});
const dist=mkdtempSync(path.resolve("dist","publy-build-"));
const glArgs=["glaze","build","--entry","packages/desktop/main.rkt","--name","Publy",
              "--version",version,"--identifier","site.jrtx.publy","--out",dist,"--installer",...signArgs];
try{
 run("raco",glArgs);
 const installers=readdirSync(dist).filter(name=>name.endsWith(platform.suffix));
 if(installers.length!==1)throw Error("Expected one "+platform.suffix+" installer");
 const staged=path.join(dist,installers[0]);
 if(release&&process.platform==="darwin"){
  run("codesign",["--verify","--deep","--strict","--test-requirement",
                   "=anchor apple generic and certificate leaf[field.1.2.840.113635.100.6.1.13] exists",
                   path.join(dist,"Publy.app")]);
  run("codesign",["--sign",process.env.PUBLY_MAC_SIGN_IDENTITY,"--timestamp",staged]);
  const notaryArgs=["notarytool","submit",staged,"--keychain-profile",
                    process.env.PUBLY_MAC_NOTARY_PROFILE,"--wait","--output-format","json"];
  if(process.env.PUBLY_MAC_NOTARY_KEYCHAIN)notaryArgs.push("--keychain",process.env.PUBLY_MAC_NOTARY_KEYCHAIN);
  const result=run("xcrun",notaryArgs,
                  {stdio:["ignore","pipe","inherit"]});
  if(JSON.parse(result).status!=="Accepted")throw Error("Apple did not accept the installer for notarization");
  run("xcrun",["stapler","staple",staged]);
  run("xcrun",["stapler","validate",staged]);
  run("codesign",["--verify","--strict",staged]);
 }else if(release&&process.platform==="win32"){
  run("signtool.exe",["verify","/pa","/all","/tw",staged]);
  run("pwsh",["-NoProfile","-NonInteractive","-Command",
     "if ((Get-AuthenticodeSignature -LiteralPath $env:PUBLY_SIGNED_MSI).SignerCertificate.Thumbprint -ne $env:PUBLY_WINDOWS_CERT_THUMBPRINT) { exit 1 }"],
     {env:{...process.env,PUBLY_SIGNED_MSI:staged}});
 }
 const target=path.resolve("dist",release?"desktop-production":"desktop-candidate");
 mkdirSync(target,{recursive:true});
 const filename=`publy-desktop-${version}-${platform.id}-${platform.arch}${platform.suffix}`;
 const artifact=path.join(target,filename);
 copyFileSync(staged,artifact);
 const digest=createHash("sha256").update(readFileSync(artifact)).digest("hex");
 writeFileSync(artifact+".sha256",digest+"  "+filename+"\n");
 console.log(filename,digest);
}finally{
 rmSync(dist,{recursive:true,force:true});
}
