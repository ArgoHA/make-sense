# Import Formats

|               | CSV | YOLO | VOC XML | VGG JSON | COCO JSON | PIXEL MASK |
|:-------------:|:---:|:----:|:-------:|:--------:|:---------:|:----------:|
| **Point**     | ☐   | ✗    | ☐       | ☐        | ☐         | ✗          |
| **Line**      | ☐   | ✗    | ✗       | ✗        | ✗         | ✗          |
| **Rect**      | ☐   | ✓    | ☐       | ☐        | ✓         | ✗          |
| **Polygon**   | ☐   | ✗    | ☐       | ☐        | ✓         | ☐          |
| **Label**     | ☐   | ✗    | ✗       | ✗        | ✗         | ✗          |
| **Segmentation** | ✗ | ✗   | ✗       | ✗        | ✗         | ✓          |

**Table 1.** The matrix of supported labels import formats, where:

- ✓ - supported format
- ☐ - not yet supported format
- ✗ - format does not make sense for a given label type

## Semantic Segmentation (PIXEL MASK)

Semantic segmentation annotations use the [D-FINE-seg](https://github.com/ArgoHA/D-FINE-seg) format:

- one single-channel (grayscale) uint8 `.png` mask per image, named with the same file name stem
  (e.g. `sample_001.jpg` ↔ `sample_001.png`)
- every pixel value is a class index (`0` to `N-1`), matching the order of the label list
- pixels with value `255` are treated as ignore / unlabeled
- optionally include a `labels.txt` file (one class name per line, line number = class index);
  without it, the current project label list is used and missing classes are auto-generated
- masks must have exactly the same dimensions as their images
