# Supermarket logo sources

These are local copies of vector artwork published by the supermarkets or
their parent brand site. Keeping the assets local avoids runtime third-party
requests and makes the compact badges reliable offline.

- `woolworths.svg`: Woolworths New Zealand Wapple from
  `https://www.woolworths.co.nz/logos/cd_logo_wapple.svg`.
- PAK'nSAVE: the stacked square logo now comes directly from PAK'nSAVE's
  official site at
  `https://au-images.contentstack.com/v3/assets/blt764dfa8e6eb818cb/blt8ee71f0335474ac5/69277547ac1a413bbe0f38d8/fs118378-pak-n-save-square.jpg`.
  The app requests a 128×96 crop that removes unused yellow space.
- New World: the black-outline diamond comes directly from Foodstuffs'
  official lockup at
  `https://au-images.contentstack.com/v3/assets/blt3febb09f1eb825b2/blt6c3a4fc231d04da8/693b4f616403dec744ab1b6f/nz-logo.jpg`.
  The app requests a 144×128 crop of the diamond only, so the wordmark never
  appears in a badge. Next's image pipeline delivers these small variants as
  WebP to supporting clients.
- `foursquare.svg`: Four Square's current square logo referenced directly by
  `foursquare.co.nz`, from
  `https://au-images.contentstack.com/v3/assets/blt7b03f4a44fa57d1b/bltcd21a4d6aaa5826c/68b4cc97ad55a449fc78e7ad/logo_square.svg`.
- `supervalue.svg`: SuperValue's inline header logo from
  `https://www.supervalue.co.nz/`; only `currentColor` was resolved to white
  for reliable rendering on the retailer's red badge.

Do not replace these with recreated text or generated artwork. When a retailer
updates its identity, refresh the asset from the retailer's official site.
