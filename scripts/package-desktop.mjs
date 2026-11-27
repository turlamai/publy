import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {copyFileSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from "node:fs";
import path from "node:path";

const platforms={
 darwin:{id:"macos",arch:"arm64",suffix:".dmg"},
 win32:{id:"windows",arch:"x64",suffix:".msi"},
 linux:{id:"linux",arch:"x64",suffix:".deb"}
};
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
mkdirSync("dist",{recursive:true});
const dist=path.resolve("dist","desktop");
const glArgs=["glaze","build","--entry","packages/desktop/main.rkt","--name","Publy",
              "--version",version,"--identifier","site.jrtx.publy","--out",dist,"--installer"];
if(process.platform==="darwin")glArgs.push("--sign","-");
run("raco",glArgs);
const installers=readdirSync(dist).filter(name=>name.endsWith(platform.suffix));
if(installers.length!==1)throw Error("Expected one "+platform.suffix+" installer");
const target=path.resolve("dist","desktop-candidate");
mkdirSync(target,{recursive:true});
const filename=`publy-desktop-${version}-${platform.id}-${platform.arch}${platform.suffix}`;
const artifact=path.join(target,filename);
copyFileSync(path.join(dist,installers[0]),artifact);
const digest=createHash("sha256").update(readFileSync(artifact)).digest("hex");
writeFileSync(artifact+".sha256",digest+"  "+filename+"\n");
console.log(filename,digest);
