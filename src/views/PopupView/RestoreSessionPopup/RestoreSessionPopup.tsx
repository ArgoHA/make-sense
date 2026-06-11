import React, {useEffect, useState} from 'react';
import './RestoreSessionPopup.scss';
import {connect} from 'react-redux';
import {useDropzone} from 'react-dropzone';
import moment from 'moment';
import {v4 as uuidv4} from 'uuid';
import {AppState} from '../../../store';
import {GenericYesNoPopup} from '../GenericYesNoPopup/GenericYesNoPopup';
import {PopupActions} from '../../../logic/actions/PopupActions';
import {ImageData, LabelName} from '../../../store/labels/types';
import {
    updateActiveImageIndex,
    updateActiveLabelType,
    updateImageData,
    updateLabelNames
} from '../../../store/labels/actionCreators';
import {updateProjectData} from '../../../store/general/actionCreators';
import {submitNewNotification} from '../../../store/notifications/actionCreators';
import {ProjectData} from '../../../store/general/types';
import {LabelType} from '../../../data/enums/LabelType';
import {INotification} from '../../../store/notifications/types';
import {NotificationType} from '../../../data/enums/NotificationType';
import {ImageDataUtil} from '../../../utils/ImageDataUtil';
import {AutoSaveEngine} from '../../../logic/autosave/AutoSaveEngine';
import {AutoSaveImageEntry, AutoSaveSnapshot, countSnapshotAnnotations} from '../../../logic/autosave/AutoSaveTypes';

interface IProps {
    updateProjectDataAction: (projectData: ProjectData) => any;
    updateLabelNamesAction: (labelNames: LabelName[]) => any;
    updateActiveLabelTypeAction: (activeLabelType: LabelType) => any;
    updateActiveImageIndexAction: (activeImageIndex: number) => any;
    updateImageDataAction: (imageData: ImageData[]) => any;
    submitNewNotificationAction: (notification: INotification) => any;
}

const RestoreSessionPopup: React.FC<IProps> = (
    {
        updateProjectDataAction,
        updateLabelNamesAction,
        updateActiveLabelTypeAction,
        updateActiveImageIndexAction,
        updateImageDataAction,
        submitNewNotificationAction
    }) => {
    const [snapshot] = useState<AutoSaveSnapshot | null>(AutoSaveEngine.getPendingRestore());
    const {acceptedFiles, getRootProps, getInputProps} = useDropzone({
        accept: {
            'image/*': ['.jpeg', '.png']
        }
    });

    useEffect(() => {
        // Defensive: nothing to restore should never open this popup, but if it
        // happens close it without dispatching during render.
        if (!snapshot) PopupActions.close();
    }, [snapshot]);

    if (!snapshot) {
        return null;
    }

    const annotationCount: number = countSnapshotAnnotations(snapshot);

    const buildFileMap = (files: File[]): Map<string, File> => {
        const map = new Map<string, File>();
        files.forEach((file: File) => {
            if (!map.has(file.name)) map.set(file.name, file);
        });
        return map;
    };

    const matchedEntries = (): AutoSaveImageEntry[] => {
        const fileMap = buildFileMap(acceptedFiles);
        return snapshot.images.filter((entry: AutoSaveImageEntry) => fileMap.has(entry.fileName));
    };

    const matchedCount: number = matchedEntries().length;

    const onAccept = () => {
        const fileMap = buildFileMap(acceptedFiles);
        const restoredImageData: ImageData[] = [];
        snapshot.images.forEach((entry: AutoSaveImageEntry) => {
            const file: File | undefined = fileMap.get(entry.fileName);
            if (!file) return;
            restoredImageData.push({
                ...ImageDataUtil.createImageDataFromFileData(file),
                labelRects: entry.labelRects,
                labelPoints: entry.labelPoints,
                labelLines: entry.labelLines,
                labelPolygons: entry.labelPolygons,
                labelNameIds: entry.labelNameIds
            });
        });

        if (restoredImageData.length === 0) return;

        updateLabelNamesAction(snapshot.labelNames);
        updateActiveLabelTypeAction(snapshot.activeLabelType);
        updateImageDataAction(restoredImageData);
        updateActiveImageIndexAction(0);
        // Setting the project type flips the app route to the editor, so do it last.
        updateProjectDataAction(snapshot.projectData);

        AutoSaveEngine.setPendingRestore(null);
        PopupActions.close();

        const missingCount: number = snapshot.images.length - restoredImageData.length;
        submitNewNotificationAction({
            id: uuidv4(),
            type: NotificationType.SUCCESS,
            header: 'Session restored',
            description: missingCount > 0
                ? `Restored ${restoredImageData.length} of ${snapshot.images.length} images. ${missingCount} could not be matched.`
                : `Restored ${restoredImageData.length} image(s) with your annotations.`
        });
    };

    const onReject = () => {
        AutoSaveEngine.clear();
        PopupActions.close();
    };

    const getDropZoneContent = () => {
        if (acceptedFiles.length === 0)
            return <>
                <input {...getInputProps()} />
                <img draggable={false} alt={'upload'} src={'ico/box-opened.png'}/>
                <p className='extraBold'>Drop the same images</p>
                <p>or</p>
                <p className='extraBold'>Click here to select them</p>
            </>;
        return <>
            <input {...getInputProps()} />
            <img draggable={false} alt={'uploaded'} src={'ico/box-closed.png'}/>
            <p className='extraBold'>{`${matchedCount} of ${snapshot.images.length} images matched`}</p>
        </>;
    };

    const renderContent = () => {
        return (<div className='RestoreSessionPopupContent'>
            <div className='Message'>
                We found an unsaved annotation session from <b>{moment(snapshot.timestamp).fromNow()}</b>
                {` — ${snapshot.images.length} image(s), ${snapshot.labelNames.length} label(s) and ${annotationCount} annotation(s).`}
                <br/>
                To bring it back, re-select the same image files below. Your annotations will be matched by file name.
            </div>
            <div {...getRootProps({className: 'DropZone'})}>
                {getDropZoneContent()}
            </div>
        </div>);
    };

    return (
        <GenericYesNoPopup
            title={'Restore previous session?'}
            renderContent={renderContent}
            acceptLabel={'Restore'}
            disableAcceptButton={matchedCount < 1}
            onAccept={onAccept}
            rejectLabel={'Discard'}
            onReject={onReject}
        />
    );
};

const mapDispatchToProps = {
    updateProjectDataAction: updateProjectData,
    updateLabelNamesAction: updateLabelNames,
    updateActiveLabelTypeAction: updateActiveLabelType,
    updateActiveImageIndexAction: updateActiveImageIndex,
    updateImageDataAction: updateImageData,
    submitNewNotificationAction: submitNewNotification
};

const mapStateToProps = (state: AppState) => ({});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(RestoreSessionPopup);
