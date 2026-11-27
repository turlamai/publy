import satori,{init} from "satori/standalone";
import yoga from "satori/yoga.wasm";
import regular from "../../core/fonts/NotoSansSC-subset-Regular.otf";
import bold from "../../core/fonts/NotoSansSC-subset-Bold.otf";
import {CARD_WIDTH,CARD_HEIGHT,cardElement} from "../../core/src/card-layout.js";
import {rasterSvg} from "./raster.mjs";

const fonts=[{name:"Noto Sans SC",weight:400,data:regular},{name:"Noto Sans SC",weight:700,data:bold}];
let ready;
export async function renderCard(palette,section,index,total){
 ready??=init(yoga);
 await ready;
 const svg=await satori(cardElement(palette,section,index,total),{width:CARD_WIDTH,height:CARD_HEIGHT,fonts});
 return rasterSvg(svg,CARD_WIDTH,CARD_HEIGHT);
}
