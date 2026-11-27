export async function rasterSvg(svg,width,height,scale=1,background){
 const image=new Image();
 image.src="data:image/svg+xml,"+encodeURIComponent(svg);
 await image.decode();
 const canvas=document.createElement("canvas");
 canvas.width=Math.ceil(width*scale);
 canvas.height=Math.ceil(height*scale);
 const ctx=canvas.getContext("2d");
 if(background){ctx.fillStyle=background;ctx.fillRect(0,0,canvas.width,canvas.height);}
 ctx.drawImage(image,0,0,canvas.width,canvas.height);
 return canvas.toDataURL("image/png");
}
