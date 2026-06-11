import {Notification} from '../enums/Notification';

export type NotificationContent = {
    header: string;
    description: string;
}

export type ExportFormatDataMap = Record<Notification, NotificationContent>;

export const NotificationsDataMap: ExportFormatDataMap = {
    [Notification.EMPTY_LABEL_NAME_ERROR]: {
        header: 'Empty label name',
        description: "Looks like you didn't assign name to one of your labels. Unfortunately it is mandatory for " +
            'every label to have unique name value. Insert correct name or delete empty label and try again.'
    },
    [Notification.NON_UNIQUE_LABEL_NAMES_ERROR]: {
        header: 'Non unique label names',
        description: 'Looks like not all your label names are unique. Unique names are necessary to guarantee correct' +
            ' data export when you complete your work. Make your names unique and try again.'
    },
    [Notification.MODEL_DOWNLOAD_ERROR]: {
        header: 'Model could not be downloaded',
        description: 'Looks like we ware unable to download tensorflow.js model from external server. Make sure that ' +
            'you are connected to internet and try again.'
    },
    [Notification.MODEL_INFERENCE_ERROR]: {
        header: 'Inference failed',
        description: 'Looks like we were unable to run inference of your image. Please help us improve Make Sense ' +
            'and let us know.'
    },
    [Notification.MODEL_LOAD_ERROR]: {
        header: 'Model could not be loaded',
        description: 'Looks like we ware unable to load your tensorflow.js model from uploaded files. Make sure that ' +
            'you uploaded all model shard files. Please re-upload all model files once again.'
    },
    [Notification.LABELS_FILE_UPLOAD_ERROR]: {
        header: 'Labels file was not uploaded',
        description: 'Looks like you forgot to upload text file containing list of detected classes names. We need ' +
            'it to map YOLOv5 model output to labels. Please re-upload all model files once again.'
    },
    [Notification.ANNOTATION_FILE_PARSE_ERROR]: {
        header: 'Annotation files could not be parsed',
        description: 'The contents of an annotation file is not valid JSON, CSV, or XML. Please fix the files ' +
            'selected to import and try again.',
    },
    [Notification.ANNOTATION_IMPORT_ASSERTION_ERROR]: {
        header: 'Annotation files did not contain valid data',
        description: 'Missing or invalid annotations provided during import. Please fix the files selected ' +
            'to import and try again.',
    },
    [Notification.UNSUPPORTED_INFERENCE_SERVER_MESSAGE]: {
        header: 'Selected inference server is not yet supported',
        description: 'Integration with selected inference server is still under construction. Stay tuned for more ' +
            'updates on our GitHub.'
    },
    [Notification.ROBOFLOW_INFERENCE_SERVER_ERROR]: {
        header: 'Roboflow connection failed',
        description: 'Looks like we ware unable to connect to your Roboflow model. Please, make sure that the model ' +
            'specification and Roboflow API key, are correct.'
    },
    [Notification.FILE_SYSTEM_API_UNSUPPORTED]: {
        header: 'Browser does not support folder access',
        description: 'Connecting a folder requires the File System Access API, which is available in Chrome and ' +
            'Edge over HTTPS or localhost. Drag and drop still works in every browser.'
    },
    [Notification.FOLDER_EMPTY_ERROR]: {
        header: 'Folder contains no images',
        description: 'We did not find any jpg, jpeg or png files in the selected folder. Pick a folder containing ' +
            'your dataset images and try again.'
    },
    [Notification.FOLDER_PERMISSION_DENIED]: {
        header: 'Folder access denied',
        description: 'Make Sense was not granted read and write access to the folder, so images cannot be loaded ' +
            'and annotations cannot be saved. Try again and accept the permission prompt.'
    },
    [Notification.FOLDER_AUTOSAVE_PAUSED]: {
        header: 'Folder autosave paused',
        description: 'We lost write access to the connected folder, so annotations are no longer saved to disk. ' +
            'Your work is still in memory - reconnect the folder or toggle autosave to resume saving.'
    },
    [Notification.FOLDER_LOAD_ERROR]: {
        header: 'Folder could not be loaded',
        description: 'Something went wrong while reading the selected folder. Make sure the folder still exists ' +
            'and is accessible, then try again.'
    },
    [Notification.FILENAME_COPIED]: {
        header: 'File name copied',
        description: 'The name of the current image was copied to your clipboard.'
    },
    [Notification.FILENAME_COPY_ERROR]: {
        header: 'Copy failed',
        description: 'We could not copy the image name to your clipboard. Please copy it manually from the ' +
            'bottom bar.'
    },
    [Notification.IMAGE_DELETE_ERROR]: {
        header: 'Image could not be deleted',
        description: 'Something went wrong while moving the image to the .trash subfolder. The image was left in ' +
            'place - check folder permissions and try again.'
    },
    [Notification.FOLDER_BASENAME_COLLISION]: {
        header: 'Duplicate image names found',
        description: 'Some images in this folder share the same base name (for example a.jpg and a.png). Their ' +
            'label files in the labels subfolder will overwrite each other. Consider renaming the images.'
    }
}
