export class NoMaskFilesProvidedError extends Error {
    constructor() {
        super('No PNG mask files were provided.');
        this.name = 'NoMaskFilesProvidedError';
        Object.setPrototypeOf(this, NoMaskFilesProvidedError.prototype);
    }
}

export class NoMasksMatchedError extends Error {
    constructor() {
        super('None of the provided PNG masks match the names of loaded images.');
        this.name = 'NoMasksMatchedError';
        Object.setPrototypeOf(this, NoMasksMatchedError.prototype);
    }
}

export class MaskFileLoadError extends Error {
    constructor(fileName: string) {
        super(`Unable to load mask file: ${fileName}.`);
        this.name = 'MaskFileLoadError';
        Object.setPrototypeOf(this, MaskFileLoadError.prototype);
    }
}

export class MaskSizeMismatchError extends Error {
    constructor(fileName: string) {
        super(`Dimensions of mask ${fileName} do not match the dimensions of its image.`);
        this.name = 'MaskSizeMismatchError';
        Object.setPrototypeOf(this, MaskSizeMismatchError.prototype);
    }
}
