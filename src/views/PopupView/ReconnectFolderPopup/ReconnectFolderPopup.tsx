import React from 'react';
import './ReconnectFolderPopup.scss';
import { GenericYesNoPopup } from '../GenericYesNoPopup/GenericYesNoPopup';
import { PopupActions } from '../../../logic/actions/PopupActions';
import { FolderProjectActions } from '../../../logic/fileSystem/FolderProjectActions';

const ReconnectFolderPopup: React.FC = () => {
    const folderName: string = FolderProjectActions.pendingReconnectHandle
        ? FolderProjectActions.pendingReconnectHandle.name
        : 'your folder';

    const renderContent = () => {
        return (
            <div className="ReconnectFolderPopupContent">
                <div className="Message">
                    {`You were annotating "${folderName}" last time. Reconnect to pick up where you left off - ` +
                        'images and YOLO labels will be loaded straight from that folder, and your work will be ' +
                        'saved back into it as you annotate.'}
                </div>
            </div>
        );
    };

    const onAccept = () => {
        // fire-and-forget - errors surface as notifications
        FolderProjectActions.reconnectAccepted();
    };

    const onReject = () => {
        // keep the stored handle - the offer simply returns on the next visit
        PopupActions.close();
    };

    return (
        <GenericYesNoPopup
            title={'Reconnect folder'}
            renderContent={renderContent}
            acceptLabel={'RECONNECT'}
            onAccept={onAccept}
            rejectLabel={'NOT NOW'}
            onReject={onReject}
        />);
};

export default ReconnectFolderPopup;
