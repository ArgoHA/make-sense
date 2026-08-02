# Export Formats

|               | CSV | YOLO | VOC XML | VGG JSON | COCO JSON | PIXEL MASK |
|:-------------:|:---:|:----:|:-------:|:--------:|:---------:|:----------:|
| **Point**     | ✓   | ✗    | ☐       | ☐        | ☐         | ✗          |
| **Line**      | ✓   | ✗    | ✗       | ✗        | ✗         | ✗          |
| **Rect**      | ✓   | ✓    | ✓       | ☐        | ☐         | ✗          |
| **Polygon**   | ☐   | ✗    | ☐       | ✓        | ✓         | ☐          |
| **Label**     | ✓   | ✗    | ✗       | ✗        | ✗         | ✗          |
| **Segmentation** | ✗ | ✗   | ✗       | ✗        | ✗         | ✓          |

**Table 1.** The matrix of supported labels export formats, where:

- ✓ - supported format
- ☐ - not yet supported format
- ✗ - format does not make sense for a given label type

## Semantic Segmentation (PIXEL MASK)

Semantic segmentation annotations are exported in the [D-FINE-seg](https://github.com/ArgoHA/D-FINE-seg)
format: a `.zip` package with one single-channel (grayscale) uint8 `.png` mask per annotated image,
named with the same file name stem as the image. Pixel values are class indices in the order of the
label list; `255` marks ignored / unlabeled pixels. The package also contains a `labels.txt` file with
the class index → name mapping.

Note: the class index of a label is its position in the label list, so avoid reordering or deleting
labels after importing or painting masks.
