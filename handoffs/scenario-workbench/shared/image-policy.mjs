export const IMAGE_POLICY='ima_local_only';
export const LOCAL_IMAGE_PATH=/^\/assets\/ima\/([a-f0-9]{24})$/;
export function assertLocalImagePath(path){
 if(typeof path!=='string'||!LOCAL_IMAGE_PATH.test(path))throw new Error('图片只能使用 ima 本地知识库素材，已拒绝外链或未登记路径。');
 return path;
}
