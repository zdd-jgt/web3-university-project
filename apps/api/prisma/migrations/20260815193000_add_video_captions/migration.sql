ALTER TABLE "VideoAsset" ADD COLUMN "captionsObjectKey" TEXT;
CREATE UNIQUE INDEX "VideoAsset_captionsObjectKey_key" ON "VideoAsset"("captionsObjectKey");
