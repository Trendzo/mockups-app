import { launchImageLibrary } from 'react-native-image-picker';
import { uploadImage } from '../../api/catalogManagement';
import { prepareUpload } from '../../utils/image';

/**
 * Pick one or more images from the library, compress each, upload it, and return
 * the resulting remote URLs (in pick order). selectionLimit 0 = unlimited.
 */
export async function pickAndUploadImages(selectionLimit = 0): Promise<string[]> {
  const res = await launchImageLibrary({ mediaType: 'photo', selectionLimit, quality: 0.9 });
  const assets = res.assets ?? [];
  const urls: string[] = [];
  for (const asset of assets) {
    if (!asset.uri) continue;
    const file = await prepareUpload(asset.uri);
    urls.push(await uploadImage(file));
  }
  return urls;
}
